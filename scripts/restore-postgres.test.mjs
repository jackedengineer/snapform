import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, readFile, rm, readdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Readable } from 'node:stream';
import { createHash, randomUUID } from 'node:crypto';
import { spawn, spawnSync } from 'node:child_process';
import { sealArchive } from './recovery-archive.mjs';
import { signBackupManifest } from './recovery-manifest.mjs';
import { postgresImage } from './backup-postgres.mjs';
const secret = Buffer.alloc(32, 7).toString('base64');
async function fixture(run) {
  const folder = await mkdtemp(join(tmpdir(), 'snapform-restore-test-'));
  try {
    const createdAt = new Date().toISOString();
    const file =
      createdAt.replaceAll(':', '-') + '-' + randomUUID() + '.sfbackup';
    await sealArchive(
      Readable.from([Buffer.from('PGDMPsynthetic')]),
      join(folder, file),
      secret,
    );
    const bytes = await readFile(join(folder, file));
    const manifest = signBackupManifest(
      {
        format: 2,
        createdAt,
        file,
        encryptedBytes: bytes.length,
        sha256: createHash('sha256').update(bytes).digest('hex'),
        tableDataEntries: 23,
        postgresImage,
      },
      secret,
    );
    const path = join(folder, file + '.json');
    await writeFile(path, JSON.stringify(manifest));
    await writeFile(
      join(folder, 'docker'),
      `#!/usr/bin/env node
import {appendFileSync} from 'node:fs';
const args=process.argv.slice(2);appendFileSync(process.env.DOCKER_TRACE,JSON.stringify(args)+'\\n');
if(args[0]==='context') console.log(process.env.FAKE_REMOTE?'tcp://remote:2375':'unix:///tmp/fake-docker.sock');
else if(args.includes('inspect'))console.log(JSON.stringify({NetworkMode:process.env.FAKE_NETWORK?'bridge':'none',ReadonlyRootfs:true,PortBindings:{}}));
else if(args.includes('run'))console.log('synthetic-container');
else if(args.includes('/proc/1/comm'))console.log('postgres');
else if(args.includes('pg_isready')&&process.env.FAKE_BLOCK)await new Promise(resolve=>setTimeout(resolve,60000));
else if(args.includes('pg_restore')&&process.env.FAKE_RESTORE_FAIL)process.exitCode=1;
else if(args.includes('psql')){let input='';for await(const chunk of process.stdin)input+=chunk;if(input.includes('json_build_object'))console.log(JSON.stringify({migrations:32,runtimeRestricted:true,jobsRestricted:true,unscopedResponses:0}));}
`,
      { mode: 0o700 },
    );
    await run({ folder, path, manifest });
  } finally {
    await rm(folder, { recursive: true, force: true });
  }
}
function invoke(folder, path, extra = {}) {
  return spawnSync(
    process.execPath,
    ['scripts/restore-postgres.mjs', path, folder],
    {
      cwd: process.cwd(),
      env: {
        ...process.env,
        PATH: folder + ':' + process.env.PATH,
        BACKUP_ENCRYPTION_KEY: secret,
        DOCKER_TRACE: join(folder, 'trace'),
        ...extra,
      },
      encoding: 'utf8',
      timeout: 15000,
    },
  );
}
async function trace(folder) {
  return (await readFile(join(folder, 'trace'), 'utf8'))
    .trim()
    .split('\n')
    .map(JSON.parse);
}
test('authenticates the descriptor before invoking Docker', () =>
  fixture(async ({ folder, path, manifest }) => {
    await writeFile(
      path,
      JSON.stringify({ ...manifest, tableDataEntries: 24 }),
    );
    const result = invoke(folder, path);
    assert.equal(result.status, 1);
    assert.match(result.stderr, /isolated_restore_failed/);
    assert.equal((await readdir(folder)).includes('trace'), false);
  }));
test('rejects a remote Docker engine before creating a container', () =>
  fixture(async ({ folder, path }) => {
    const result = invoke(folder, path, { FAKE_REMOTE: '1' });
    assert.equal(result.status, 1);
    assert.equal(
      (await trace(folder)).some((args) => args.includes('run')),
      false,
    );
    assert.equal(
      (await readdir(folder)).some((name) => name.startsWith('.restore-')),
      false,
    );
  }));
test('uses an isolated disposable container and removes plaintext after verification', () =>
  fixture(async ({ folder, path }) => {
    const result = invoke(folder, path);
    assert.equal(result.status, 0, result.stderr);
    const calls = await trace(folder),
      start = calls.find((args) => args.includes('run'));
    assert.ok(start.includes('--read-only'));
    assert.equal(start[start.indexOf('--network') + 1], 'none');
    assert.equal(start.includes('-p'), false);
    assert.equal(start.includes('--publish'), false);
    assert.equal(start.includes('--mount'), false);
    assert.ok(start.includes(postgresImage));
    assert.ok(calls.some((args) => args.includes('/proc/1/comm')));
    assert.ok(
      calls.some(
        (args) =>
          args.includes('pg_restore') &&
          args.includes('--exit-on-error') &&
          args.includes('--single-transaction') &&
          args.includes('--role=snapform_owner'),
      ),
    );
    assert.equal(calls.at(-1).includes('rm'), true);
    assert.equal(
      (await readdir(folder)).some((name) => name.startsWith('.restore-')),
      false,
    );
    assert.match(result.stdout, /isolated_restore_verified/);
    assert.equal(result.stdout.includes('PGDMP'), false);
  }));
for (const extra of [{ FAKE_RESTORE_FAIL: '1' }, { FAKE_NETWORK: '1' }])
  test(
    'cleans its container and authenticated plaintext on verification failure ' +
      Object.keys(extra)[0],
    () =>
      fixture(async ({ folder, path }) => {
        const result = invoke(folder, path, extra);
        assert.equal(result.status, 1);
        const calls = await trace(folder);
        assert.equal(calls.at(-1).includes('rm'), true);
        assert.equal(
          (await readdir(folder)).some((name) => name.startsWith('.restore-')),
          false,
        );
        assert.equal(result.stderr.includes(secret), false);
      }),
  );

test('SIGTERM waits for container and plaintext cleanup', () =>
  fixture(async ({ folder, path }) => {
    const child = spawn(
      process.execPath,
      ['scripts/restore-postgres.mjs', path, folder],
      {
        env: {
          ...process.env,
          PATH: folder + ':' + process.env.PATH,
          BACKUP_ENCRYPTION_KEY: secret,
          DOCKER_TRACE: join(folder, 'trace'),
          FAKE_BLOCK: '1',
        },
        stdio: ['ignore', 'ignore', 'ignore'],
      },
    );
    const closed = new Promise((resolve) =>
      child.once('close', (code, signal) => resolve({ code, signal })),
    );
    try {
      const until = Date.now() + 8000;
      while (true) {
        let calls = [];
        try {
          calls = await trace(folder);
        } catch (error) {
          if (error.code !== 'ENOENT') throw error;
        }
        if (calls.some((args) => args.includes('pg_isready'))) break;
        if (Date.now() >= until) throw Error('Blocked stage not reached');
        await new Promise((resolve) => setTimeout(resolve, 30));
      }
      child.kill('SIGTERM');
      const result = await closed;
      assert.equal(result.code, 1);
      assert.equal(result.signal, null);
      assert.equal((await trace(folder)).at(-1).includes('rm'), true);
      assert.equal(
        (await readdir(folder)).some((name) => name.startsWith('.restore-')),
        false,
      );
    } finally {
      if (child.exitCode === null) child.kill('SIGKILL');
    }
  }));

test('an operator inspection failure still removes the restored copy', () =>
  fixture(async ({ folder, path }) => {
    const script = join(folder, 'inspection.mjs');
    await writeFile(
      script,
      `import {verifyIsolatedRestore} from ${JSON.stringify(new URL('./restore-postgres.mjs', import.meta.url).href)};
 try{await verifyIsolatedRestore({manifestPath:process.argv[2],secret:process.env.BACKUP_ENCRYPTION_KEY,workDirectory:process.argv[3],inspect:async({executeSql})=>{await executeSql('SELECT 1;');throw Error('Synthetic inspection failure');}});}catch{process.exitCode=1;}`,
    );
    const result = spawnSync(process.execPath, [script, path, folder], {
      env: {
        ...process.env,
        PATH: folder + ':' + process.env.PATH,
        BACKUP_ENCRYPTION_KEY: secret,
        DOCKER_TRACE: join(folder, 'trace'),
      },
      encoding: 'utf8',
      timeout: 15000,
    });
    assert.equal(result.status, 1);
    assert.equal((await trace(folder)).at(-1).includes('rm'), true);
    assert.equal(
      (await readdir(folder)).some((name) => name.startsWith('.restore-')),
      false,
    );
  }));
