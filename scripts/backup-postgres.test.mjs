import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  mkdtemp,
  writeFile,
  readFile,
  readdir,
  rm,
  stat,
} from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import {
  postgresEnvironment,
  publishRecoveryBackup,
} from './backup-postgres.mjs';
test('publishes a complete private pair and rolls back its archive if a manifest cannot be published', async () => {
  const folder = await mkdtemp(join(tmpdir(), 'snapform-publish-'));
  try {
    const source = join(folder, 'source'),
      manifest = { file: 'synthetic.sfbackup', format: 2 };
    const archive = join(folder, manifest.file),
      descriptor = archive + '.json';
    await writeFile(source, 'encrypted fixture', { mode: 0o600 });
    await writeFile(descriptor, 'preserve existing descriptor');
    await assert.rejects(publishRecoveryBackup(source, folder, manifest), {
      code: 'EEXIST',
    });
    await assert.rejects(stat(archive), { code: 'ENOENT' });
    assert.equal(
      await readFile(descriptor, 'utf8'),
      'preserve existing descriptor',
    );
    assert.deepEqual((await readdir(folder)).sort(), [
      'source',
      'synthetic.sfbackup.json',
    ]);
    await rm(descriptor);
    await publishRecoveryBackup(source, folder, manifest);
    assert.equal(await readFile(archive, 'utf8'), 'encrypted fixture');
    assert.deepEqual(JSON.parse(await readFile(descriptor, 'utf8')), manifest);
    assert.equal((await stat(descriptor)).mode & 0o777, 0o600);
    await assert.rejects(publishRecoveryBackup(source, folder, manifest), {
      code: 'EEXIST',
    });
    assert.equal(await readFile(archive, 'utf8'), 'encrypted fixture');
    assert.deepEqual((await readdir(folder)).sort(), [
      'source',
      'synthetic.sfbackup',
      'synthetic.sfbackup.json',
    ]);
  } finally {
    await rm(folder, { recursive: true, force: true });
  }
});
test('passes PostgreSQL credentials through environment with verified TLS and the one allowed database', () => {
  const env = postgresEnvironment(
    'postgresql://backup:synthetic%21@ep-synthetic.eu-central-1.aws.neon.tech/snapform?sslmode=require',
  );
  assert.equal(env.PGPASSWORD, 'synthetic!');
  assert.equal(env.PGSSLMODE, 'verify-full');
  assert.equal(env.PGSSLROOTCERT, 'system');
  assert.equal(env.PGDATABASE, 'snapform');
  assert.equal(Object.hasOwn(env, 'DATABASE_URL'), false);
});
test('rejects pooled, foreign, missing and malformed connections without reflecting a credential', () => {
  for (const url of [
    'postgresql://backup:synthetic@ep-test-pooler.region.neon.tech/snapform',
    'postgresql://backup:synthetic@unrelated.example/snapform',
    'postgresql://backup:synthetic@ep-test.region.neon.tech/another',
    'postgresql://ep-test.region.neon.tech/snapform',
    'postgresql://backup:private-password@',
  ]) {
    let caught = false;
    try {
      postgresEnvironment(url);
    } catch (error) {
      caught = true;
      assert.equal(String(error.message).includes('private-password'), false);
    }
    assert.equal(caught, true);
  }
});
