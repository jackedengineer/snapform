import { test } from 'node:test';
import assert from 'node:assert/strict';
import { r2BackupConfig } from './backup-r2.mjs';
const accountId = 'a'.repeat(32),
  accessKeyId = 'b'.repeat(32),
  secretAccessKey = 'c'.repeat(64);
const name =
  '2026-10-30T17-00-00.000Z-01234567-89ab-4cde-8123-456789abcdef.sfbackup';
test('restricts backup transfers and keeps authentication out of process arguments', () => {
  const request = r2BackupConfig({
    accountId,
    accessKeyId,
    secretAccessKey,
    file: name,
    method: 'PUT',
    bytes: 123,
    sha256: 'd'.repeat(64),
  });
  assert.deepEqual(request.args, ['-q', '--config', '-']);
  assert.ok(request.config.includes('aws-sigv4 = "aws:amz:auto:s3"'));
  assert.ok(
    request.config.includes(`user = "${accessKeyId}:${secretAccessKey}"`),
  );
  assert.ok(
    request.config.includes(
      `url = "https://${accountId}.r2.cloudflarestorage.com/snapform-backups/archives/${name}"`,
    ),
  );
  assert.ok(request.config.includes('header = "If-None-Match: *"'));
  assert.ok(request.config.includes('header = "Content-Length: 123"'));
  assert.ok(!request.config.includes('location'));
  assert.ok(!request.args.join(' ').includes(secretAccessKey));
  const download = r2BackupConfig({
    accountId,
    accessKeyId,
    secretAccessKey,
    file: name + '.json',
    method: 'GET',
    bytes: 4096,
  });
  assert.ok(download.config.includes('max-filesize = 4096'));
  assert.ok(!download.config.includes('upload-file'));
});
test('rejects foreign paths, methods, injected credentials and unbounded bodies', () => {
  const valid = {
    accountId,
    accessKeyId,
    secretAccessKey,
    file: name,
    method: 'GET',
    bytes: 4096,
  };
  for (const patch of [
    { accountId: 'foreign.example' },
    { accessKeyId: 'x\nverbose' },
    { secretAccessKey: 'bad"\nurl=evil' },
    { file: '../' + name },
    { file: name + '?token=secret' },
    { method: 'DELETE' },
    { bytes: 0 },
    { bytes: Infinity },
    { bytes: 1073741825 },
    { method: 'PUT', sha256: 'invalid' },
  ]) {
    assert.throws(
      () => r2BackupConfig({ ...valid, ...patch }),
      /INVALID_R2_BACKUP_REQUEST/,
    );
  }
});

import {
  mkdtemp,
  writeFile,
  readFile,
  rm,
  mkdir,
  readdir,
  stat,
} from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { transferBackupObject, publishBackupToR2 } from './backup-r2.mjs';
import { signBackupManifest } from './recovery-manifest.mjs';

const settings = {
  accountId,
  accessKeyId,
  secretAccessKey,
  secret: Buffer.alloc(32, 7).toString('base64'),
};

async function withFakeCurl(run) {
  const folder = await mkdtemp(join(tmpdir(), 'snapform-fake-curl-'));
  const previousPath = process.env.PATH;
  try {
    await mkdir(join(folder, 'remote'));
    await writeFile(
      join(folder, 'curl'),
      `#!${process.execPath}
const fs = require('node:fs'), path = require('node:path');
const folder = ${JSON.stringify(folder)};
let config = '';
process.stdin.on('data', chunk => { config += chunk; });
process.stdin.on('end', () => {
  const method = config.match(/^request = "(GET|PUT)"$/m)[1];
  const file = path.basename(config.match(/^url = "([^"]+)"$/m)[1]);
  fs.appendFileSync(path.join(folder, 'calls'), JSON.stringify({ args: process.argv.slice(2), config, method, file }) + '\\n');
  const modeFile = path.join(folder, 'mode');
  const mode = fs.existsSync(modeFile) ? fs.readFileSync(modeFile, 'utf8') : '';
  if (mode === '403' && method === 'GET') { process.stderr.write('403 provider detail synthetic-secret'); process.exitCode = 22; return; }
  const remote = path.join(folder, 'remote', file);
  if (method === 'PUT') {
    if (fs.existsSync(remote)) { process.stderr.write('412'); process.exitCode = 22; return; }
    fs.writeFileSync(remote, fs.readFileSync(3));
  } else {
    let bytes = fs.existsSync(remote) ? fs.readFileSync(remote) : Buffer.from('downloaded replacement');
    if (!file.endsWith('.json') && mode === 'truncated') bytes = bytes.subarray(0, bytes.length - 1);
    if (!file.endsWith('.json') && mode === 'altered') { bytes = Buffer.from(bytes); bytes[0] ^= 1; }
    if (file.endsWith('.json') && mode === 'tampered-manifest') bytes = Buffer.from(bytes.toString().replace('"tableDataEntries":1', '"tableDataEntries":2'));
    if (mode === 'oversized') bytes = Buffer.alloc(Number(config.match(/^max-filesize = (\\d+)$/m)[1]) + 1);
    process.stdout.write(bytes);
  }
  process.stderr.write('200');
});
`,
      { mode: 0o700 },
    );
    process.env.PATH = folder + ':' + (previousPath || '');
    await run(folder);
  } finally {
    if (previousPath === undefined) delete process.env.PATH;
    else process.env.PATH = previousPath;
    await rm(folder, { recursive: true, force: true });
  }
}

test('a refused download preserves an existing destination byte for byte', () =>
  withFakeCurl(async (folder) => {
    const destination = join(folder, 'existing.sfbackup');
    await writeFile(destination, 'previous recovery copy', { mode: 0o600 });
    await assert.rejects(
      transferBackupObject(
        {
          accountId,
          accessKeyId,
          secretAccessKey,
          file: name,
          method: 'GET',
          bytes: 128,
        },
        destination,
      ),
      /R2_BACKUP_TRANSFER_FAILED/,
    );
    assert.equal(await readFile(destination, 'utf8'), 'previous recovery copy');
  }));

async function backupFixture(folder, age = 0) {
  const createdAt = new Date(Date.now() - age).toISOString();
  const file = `${createdAt.replaceAll(':', '-')}-01234567-89ab-4cde-8123-456789abcdef.sfbackup`;
  const bytes = Buffer.from('synthetic encrypted recovery bytes');
  const manifest = signBackupManifest(
    {
      format: 2,
      createdAt,
      file,
      encryptedBytes: bytes.length,
      sha256: createHash('sha256').update(bytes).digest('hex'),
      tableDataEntries: 1,
      postgresImage: `postgres@sha256:${'d'.repeat(64)}`,
    },
    settings.secret,
  );
  const manifestPath = join(folder, file + '.json');
  await writeFile(join(folder, file), bytes, { mode: 0o600 });
  await writeFile(manifestPath, JSON.stringify(manifest), { mode: 0o600 });
  return { manifest, manifestPath, bytes };
}

test('publishes archive before descriptor, verifies downloaded bytes, and keeps credentials off argv', () =>
  withFakeCurl(async (folder) => {
    const fixture = await backupFixture(folder);
    const result = await publishBackupToR2(fixture.manifestPath, settings);
    assert.equal(result.manifest.sha256, fixture.manifest.sha256);
    assert.deepEqual(
      await readFile(join(result.manifestPath, '..', fixture.manifest.file)),
      fixture.bytes,
    );
    assert.equal((await stat(result.manifestPath)).mode & 0o777, 0o600);
    const calls = (await readFile(join(folder, 'calls'), 'utf8'))
      .trim()
      .split('\n')
      .map(JSON.parse);
    assert.deepEqual(
      calls.map(({ method, file }) => [method, file]),
      [
        ['PUT', fixture.manifest.file],
        ['PUT', fixture.manifest.file + '.json'],
        ['GET', fixture.manifest.file + '.json'],
        ['GET', fixture.manifest.file],
      ],
    );
    for (const call of calls) {
      assert.deepEqual(call.args, ['-q', '--config', '-']);
      assert.ok(!call.args.join(' ').includes(secretAccessKey));
      assert.ok(
        call.config.includes(`user = "${accessKeyId}:${secretAccessKey}"`),
      );
    }
    await assert.rejects(
      publishBackupToR2(fixture.manifestPath, settings),
      /R2_BACKUP_TRANSFER_FAILED/,
    );
    assert.deepEqual(
      await readFile(join(folder, 'remote', fixture.manifest.file)),
      fixture.bytes,
    );
  }));

test('failed or oversized downloads remove partial output and hide provider diagnostics', () =>
  withFakeCurl(async (folder) => {
    for (const mode of ['403', 'oversized']) {
      await writeFile(join(folder, 'mode'), mode);
      const destination = join(folder, 'download');
      await assert.rejects(
        transferBackupObject(
          {
            accountId,
            accessKeyId,
            secretAccessKey,
            file: name,
            method: 'GET',
            bytes: 8,
          },
          destination,
        ),
        (error) => {
          assert.equal(error.message, 'R2_BACKUP_TRANSFER_FAILED');
          return true;
        },
      );
      await assert.rejects(stat(destination), { code: 'ENOENT' });
    }
  }));

for (const mode of ['truncated', 'altered', 'tampered-manifest'])
  test(`rejects ${mode} remote recovery data and removes its private download directory`, () =>
    withFakeCurl(async (folder) => {
      const fixture = await backupFixture(folder);
      await writeFile(join(folder, 'mode'), mode);
      await assert.rejects(
        publishBackupToR2(fixture.manifestPath, settings),
        /BACKUP_BYTES_MISMATCH|INVALID_BACKUP_MANIFEST/,
      );
      assert.equal(
        (await readdir(folder)).some((file) => file.startsWith('.remote-')),
        false,
      );
      assert.deepEqual(
        await readFile(join(folder, fixture.manifest.file)),
        fixture.bytes,
      );
    }));

test('rejects an expired signed archive before starting any transfer', () =>
  withFakeCurl(async (folder) => {
    const fixture = await backupFixture(folder, 31 * 86400000);
    await assert.rejects(
      publishBackupToR2(fixture.manifestPath, settings),
      /BACKUP_EXPIRED/,
    );
    await assert.rejects(stat(join(folder, 'calls')), { code: 'ENOENT' });
  }));
