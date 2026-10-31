import { spawn } from 'node:child_process';
import { createReadStream } from 'node:fs';
import { mkdtemp, mkdir, open, rm } from 'node:fs/promises';
import { pipeline } from 'node:stream/promises';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { randomUUID } from 'node:crypto';
import { verifyRecoveryFiles } from './recovery-manifest.mjs';
import { openArchive } from './recovery-archive.mjs';
import { postgresImage } from './backup-postgres.mjs';
async function docker(args, input, signal) {
  const child = spawn('docker', args, {
    stdio: ['pipe', 'pipe', 'pipe'],
    signal: signal
      ? AbortSignal.any([signal, AbortSignal.timeout(120000)])
      : AbortSignal.timeout(120000),
  });
  child.stderr.resume();
  const finished = new Promise((accept, reject) => {
    child.once('error', () => reject(Error('RESTORE_TOOL_FAILED')));
    child.once('close', (code) =>
      code === 0 ? accept() : reject(Error('RESTORE_TOOL_FAILED')),
    );
  });
  const output = (async () => {
    let value = '';
    for await (const chunk of child.stdout) {
      value += chunk.toString();
      if (Buffer.byteLength(value) > 1024 * 1024) {
        child.kill();
        throw Error('RESTORE_OUTPUT_LIMIT');
      }
    }
    return value.trim();
  })();
  const sent =
    input && typeof input !== 'string'
      ? pipeline(input, child.stdin)
      : new Promise((accept, reject) =>
          child.stdin.end(input ?? '', (error) =>
            error ? reject(error) : accept(),
          ),
        );
  child.stdin.on('error', () => {}); // The awaited write/pipeline reports stream failure.
  const results = await Promise.allSettled([output, finished, sent]);
  for (const index of [1, 0, 2])
    if (results[index].status === 'rejected') throw results[index].reason;
  return results[0].value;
}
const bootstrap = `
CREATE ROLE neondb_owner NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION;
CREATE ROLE snapform_owner LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION BYPASSRLS;
CREATE ROLE cloud_admin NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION;
CREATE ROLE neon_superuser NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION;
CREATE ROLE snapform_runtime LOGIN NOINHERIT NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS;
CREATE ROLE snapform_jobs LOGIN NOINHERIT NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS;
CREATE ROLE snapform_backup LOGIN NOINHERIT NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION BYPASSRLS;
GRANT cloud_admin,neondb_owner TO snapform_owner;
ALTER DATABASE snapform OWNER TO snapform_owner;
DROP SCHEMA public;
`;
const verify = `
SELECT json_build_object(
 'migrations',(SELECT count(*) FROM drizzle.__drizzle_migrations),
 'runtimeRestricted',(SELECT NOT rolsuper AND NOT rolcreatedb AND NOT rolcreaterole AND NOT rolreplication AND NOT rolinherit AND NOT rolbypassrls FROM pg_roles WHERE rolname='snapform_runtime')
  AND NOT has_table_privilege('snapform_runtime','public.purge_intent','SELECT')
  AND NOT has_function_privilege('snapform_runtime','public.finalize_response_purge(uuid)','EXECUTE'),
 'jobsRestricted',(SELECT NOT rolsuper AND NOT rolcreatedb AND NOT rolcreaterole AND NOT rolreplication AND NOT rolinherit AND NOT rolbypassrls FROM pg_roles WHERE rolname='snapform_jobs')
  AND NOT has_table_privilege('snapform_jobs','public.user','SELECT')
  AND has_function_privilege('snapform_jobs','public.finalize_response_purge(uuid)','EXECUTE')
);
SET ROLE snapform_runtime;
SELECT json_build_object('unscopedResponses',(SELECT count(*) FROM public.response_session));
`;
export async function verifyIsolatedRestore({
  manifestPath,
  secret,
  workDirectory,
  inspect,
}) {
  const manifest = await verifyRecoveryFiles(manifestPath, secret);
  if (manifest.postgresImage !== postgresImage)
    throw Error('UNAPPROVED_RESTORE_IMAGE');
  const directory = resolve(workDirectory);
  await mkdir(directory, { recursive: true, mode: 0o700 });
  const work = await mkdtemp(join(directory, '.restore-'));
  const dump = join(work, 'verified.dump');
  let host,
    attempted = false,
    stage = 'archive';
  const name = 'snapform-restore-' + randomUUID();
  const started = Date.now();
  const controller = new AbortController();
  const stop = () => controller.abort();
  process.once('SIGINT', stop);
  process.once('SIGTERM', stop);
  const run = (args, input) => docker(args, input, controller.signal);
  try {
    await openArchive(
      join(resolve(manifestPath, '..'), manifest.file),
      dump,
      secret,
    );
    const handle = await open(dump, 'r');
    try {
      const bytes = Buffer.alloc(5);
      await handle.read(bytes, 0, 5, 0);
      if (bytes.toString() !== 'PGDMP') throw Error('INVALID_POSTGRES_ARCHIVE');
    } finally {
      await handle.close();
    }
    stage = 'engine';
    host = await run([
      'context',
      'inspect',
      '--format',
      '{{.Endpoints.docker.Host}}',
    ]);
    if (!/^unix:\/\/\//.test(host)) throw Error('LOCAL_DOCKER_REQUIRED');
    stage = 'container';
    attempted = true;
    await run([
      '--host',
      host,
      'run',
      '--detach',
      '--name',
      name,
      '--network',
      'none',
      '--read-only',
      '--cap-drop',
      'ALL',
      '--security-opt',
      'no-new-privileges',
      '--user',
      'postgres',
      '--tmpfs',
      '/var/lib/postgresql:rw,nosuid,nodev,uid=999,gid=999',
      '--tmpfs',
      '/var/run/postgresql:rw,nosuid,nodev,uid=999,gid=999',
      '--tmpfs',
      '/tmp:rw,nosuid,nodev',
      '--env',
      'POSTGRES_HOST_AUTH_METHOD=trust',
      '--env',
      'POSTGRES_DB=snapform',
      postgresImage,
    ]);
    stage = 'isolation';
    const config = JSON.parse(
      await run([
        '--host',
        host,
        'inspect',
        '--format',
        '{{json .HostConfig}}',
        name,
      ]),
    );
    if (
      config.NetworkMode !== 'none' ||
      config.ReadonlyRootfs !== true ||
      Object.keys(config.PortBindings ?? {}).length
    )
      throw Error('RESTORE_ISOLATION_FAILED');
    stage = 'readiness';
    const until = Date.now() + 15000;
    while (true) {
      try {
        // The entrypoint's temporary initialization server also answers pg_isready.
        // Wait until PID 1 is the final server before sending restore SQL.
        if (
          (await run(['--host', host, 'exec', name, 'cat', '/proc/1/comm'])) !==
          'postgres'
        )
          throw Error('RESTORE_INITIALIZING');
        await run([
          '--host',
          host,
          'exec',
          name,
          'pg_isready',
          '-U',
          'postgres',
          '-d',
          'snapform',
        ]);
        break;
      } catch (error) {
        controller.signal.throwIfAborted();
        if (Date.now() >= until) throw error;
        await new Promise((accept) => setTimeout(accept, 100));
      }
    }
    const psql = [
      '--host',
      host,
      'exec',
      '-i',
      name,
      'psql',
      '-U',
      'postgres',
      '-d',
      'snapform',
      '--no-psqlrc',
      '-v',
      'ON_ERROR_STOP=1',
      '-At',
    ];
    stage = 'bootstrap';
    await run(psql, bootstrap);
    stage = 'restore';
    await run(
      [
        '--host',
        host,
        'exec',
        '-i',
        name,
        'pg_restore',
        '-U',
        'postgres',
        '-d',
        'snapform',
        '--exit-on-error',
        '--single-transaction',
        '--no-owner',
        '--role=snapform_owner',
      ],
      createReadStream(dump),
    );
    stage = 'verification';
    await run(psql, 'REVOKE cloud_admin,neondb_owner FROM snapform_owner;');
    if (inspect) {
      stage = 'inspection';
      await inspect({ executeSql: (input) => run(psql, input) });
    }
    const output = (await run(psql, verify))
      .split('\n')
      .filter((line) => line.startsWith('{'))
      .map(JSON.parse);
    const facts = Object.assign({}, ...output);
    if (
      !Number.isSafeInteger(facts.migrations) ||
      facts.migrations < 31 ||
      facts.runtimeRestricted !== true ||
      facts.jobsRestricted !== true ||
      facts.unscopedResponses !== 0
    )
      throw Error('RESTORE_AUTHORIZATION_FAILED');
    return {
      event: 'isolated_restore_verified',
      elapsedMs: Date.now() - started,
      migrations: facts.migrations,
      network: 'none',
      publishedPorts: 0,
      purgeReplay: 'not-exercised',
    };
  } catch {
    throw Object.assign(Error('RESTORE_FAILED'), { stage });
  } finally {
    try {
      if (attempted) await docker(['--host', host, 'rm', '--force', name]);
    } finally {
      try {
        await rm(work, { recursive: true, force: true });
      } finally {
        process.removeListener('SIGINT', stop);
        process.removeListener('SIGTERM', stop);
      }
    }
  }
}
if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(resolve(process.argv[1])).href
) {
  try {
    if (!process.argv[2] || !process.env.BACKUP_ENCRYPTION_KEY)
      throw Error('RESTORE_CONFIG_REQUIRED');
    console.log(
      JSON.stringify(
        await verifyIsolatedRestore({
          manifestPath: resolve(process.argv[2]),
          secret: process.env.BACKUP_ENCRYPTION_KEY,
          workDirectory: process.argv[3] || '.recovery',
        }),
      ),
    );
  } catch (error) {
    console.error(
      JSON.stringify({
        event: 'isolated_restore_failed',
        stage: error.stage ?? 'preflight',
      }),
    );
    process.exitCode = 1;
  }
}
