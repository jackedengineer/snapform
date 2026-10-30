import { spawn, execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { randomUUID, createHash } from 'node:crypto';
import { writeFile, mkdir, mkdtemp, rm, open, link } from 'node:fs/promises';
import { createReadStream } from 'node:fs';
import { resolve, join, basename } from 'node:path';
import { pathToFileURL } from 'node:url';
import { sealArchive, openArchive } from './recovery-archive.mjs';
import { signBackupManifest } from './recovery-manifest.mjs';
export const postgresImage =
  'postgres@sha256:77f585114c32fbca283dc835b0596f4e52b51b4c6662d7810b2f4084f60a1873';
export function postgresEnvironment(connectionString) {
  try {
    const url = new URL(connectionString);
    if (
      !['postgres:', 'postgresql:'].includes(url.protocol) ||
      !url.hostname.endsWith('.neon.tech') ||
      url.hostname.includes('-pooler.') ||
      url.pathname !== '/snapform' ||
      !url.username ||
      !url.password ||
      (url.port && url.port !== '5432') ||
      url.hash
    )
      throw Error();
    return {
      PGHOST: url.hostname,
      PGPORT: '5432',
      PGDATABASE: 'snapform',
      PGUSER: decodeURIComponent(url.username),
      PGPASSWORD: decodeURIComponent(url.password),
      PGSSLMODE: 'verify-full',
      PGSSLROOTCERT: 'system',
      PGCONNECT_TIMEOUT: '10',
    };
  } catch {
    throw Error('A direct Neon backup connection for snapform is required.');
  }
}
async function localDockerHost() {
  const { stdout } = await promisify(execFile)(
    'docker',
    ['context', 'inspect', '--format', '{{.Endpoints.docker.Host}}'],
    { timeout: 10000 },
  );
  const host = stdout.trim();
  if (!host.startsWith('unix://'))
    throw Error('Recovery export requires a local Docker engine.');
  return host;
}
function runDocker(host, args, environment = {}) {
  const child = spawn(
    'docker',
    [
      '--host',
      host,
      'run',
      '--rm',
      '--read-only',
      ...Object.keys(environment).flatMap((key) => ['--env', key]),
      ...args,
    ],
    {
      env: { ...process.env, ...environment },
      stdio: ['ignore', 'pipe', 'pipe'],
      signal: AbortSignal.timeout(120000),
    },
  );
  // Provider diagnostics may contain connection details. Expose only a fixed failure.
  child.stderr.resume();
  const finished = new Promise((resolve, reject) => {
    child.once('error', () => reject(Error('Recovery tool could not start.')));
    child.once('close', (code) =>
      code === 0 ? resolve() : reject(Error('Recovery tool failed.')),
    );
  });
  return { child, finished };
}
// Publish the flushed descriptor last. Readers discover pairs by descriptors,
// and a handled publication failure removes only the archive linked here.
export async function publishRecoveryBackup(source, directory, manifest) {
  if (
    typeof manifest.file !== 'string' ||
    basename(manifest.file) !== manifest.file ||
    manifest.file.startsWith('.') ||
    !manifest.file.endsWith('.sfbackup')
  )
    throw Error('INVALID_BACKUP_PUBLICATION');
  const staging = await mkdtemp(join(directory, '.publish-'));
  const destination = join(directory, manifest.file);
  try {
    const descriptor = join(staging, 'manifest.json');
    await writeFile(descriptor, JSON.stringify(manifest, null, 2) + '\n', {
      flag: 'wx',
      mode: 0o600,
      flush: true,
    });
    await link(source, destination);
    try {
      await link(descriptor, destination + '.json');
    } catch (error) {
      await rm(destination);
      throw error;
    }
  } finally {
    await rm(staging, { recursive: true, force: true });
  }
}
export async function createRecoveryBackup({
  connectionString,
  secret,
  outputDirectory,
}) {
  const environment = postgresEnvironment(connectionString);
  const dockerHost = await localDockerHost();
  const directory = resolve(outputDirectory);
  await mkdir(directory, { recursive: true, mode: 0o700 });
  const work = await mkdtemp(join(directory, '.export-'));
  const encrypted = join(work, 'archive.enc'),
    recovered = join(work, 'verified.dump');
  try {
    const dump = runDocker(
      dockerHost,
      [
        postgresImage,
        'pg_dump',
        '--no-password',
        '--format=custom',
        '--no-owner',
        '--schema=public',
        '--schema=drizzle',
        '--strict-names',
        '--lock-wait-timeout=5000',
      ],
      environment,
    );
    try {
      await Promise.all([
        sealArchive(dump.child.stdout, encrypted, secret),
        dump.finished,
      ]);
    } finally {
      if (dump.child.exitCode === null) dump.child.kill('SIGTERM');
    }
    await openArchive(encrypted, recovered, secret);
    const handle = await open(recovered, 'r');
    try {
      const header = Buffer.alloc(5);
      await handle.read(header, 0, 5, 0);
      if (header.toString() !== 'PGDMP')
        throw Error('The export is not a PostgreSQL archive.');
    } finally {
      await handle.close();
    }
    const inspection = runDocker(dockerHost, [
      '--network',
      'none',
      '--mount',
      `type=bind,src=${work},dst=/archive,readonly`,
      postgresImage,
      'pg_restore',
      '--list',
      '/archive/verified.dump',
    ]);
    const readToc = (async () => {
      let toc = '';
      for await (const chunk of inspection.child.stdout) {
        toc += chunk.toString();
        if (toc.length > 1024 * 1024) {
          inspection.child.kill('SIGTERM');
          throw Error('Recovery metadata is unexpectedly large.');
        }
      }
      return toc;
    })();
    const [toc] = await Promise.all([readToc, inspection.finished]);
    const tableDataEntries = toc
      .split('\n')
      .filter((line) => /\sTABLE DATA\s/.test(line)).length;
    if (!tableDataEntries)
      throw Error('The recovery archive contains no table data entries.');
    const hash = createHash('sha256');
    let encryptedBytes = 0;
    for await (const chunk of createReadStream(encrypted)) {
      hash.update(chunk);
      encryptedBytes += chunk.length;
    }
    const createdAt = new Date().toISOString();
    const name =
      createdAt.replaceAll(':', '-') + '-' + randomUUID() + '.sfbackup';
    const destination = join(directory, name);
    const manifest = signBackupManifest(
      {
        format: 2,
        createdAt,
        file: basename(destination),
        encryptedBytes,
        sha256: hash.digest('hex'),
        tableDataEntries,
        postgresImage,
      },
      secret,
    );
    await publishRecoveryBackup(encrypted, directory, manifest);
    return manifest;
  } finally {
    await rm(work, { recursive: true, force: true });
  }
}
if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(resolve(process.argv[1])).href
) {
  try {
    if (!process.env.DATABASE_BACKUP_URL || !process.env.BACKUP_ENCRYPTION_KEY)
      throw Error();
    const result = await createRecoveryBackup({
      connectionString: process.env.DATABASE_BACKUP_URL,
      secret: process.env.BACKUP_ENCRYPTION_KEY,
      outputDirectory: process.argv[2] || '.recovery',
    });
    console.log(
      JSON.stringify({ event: 'encrypted_backup_created', ...result }),
    );
  } catch {
    console.error(JSON.stringify({ event: 'encrypted_backup_failed' }));
    process.exitCode = 1;
  }
}
