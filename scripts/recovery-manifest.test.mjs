import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdtemp, writeFile, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  signBackupManifest,
  verifyBackupManifest,
  verifyRecoveryFiles,
} from './recovery-manifest.mjs';
const key = Buffer.alloc(32, 7).toString('base64');
const now = Date.parse('2026-10-30T12:00:00.000Z');
test('verifies signed metadata against exact downloaded bytes before decrypting', async () => {
  const folder = await mkdtemp(join(tmpdir(), 'snapform-manifest-'));
  try {
    const bytes = Buffer.from('synthetic encrypted artifact'),
      raw = fixture();
    raw.createdAt = new Date().toISOString();
    raw.file = `${raw.createdAt.replaceAll(':', '-')}-00000000-0000-4000-8000-000000000001.sfbackup`;
    raw.encryptedBytes = bytes.length;
    raw.sha256 = createHash('sha256').update(bytes).digest('hex');
    const manifestFile = join(folder, raw.file + '.json'),
      artifact = join(folder, raw.file);
    await writeFile(artifact, bytes);
    await writeFile(manifestFile, JSON.stringify(signBackupManifest(raw, key)));
    assert.deepEqual(await verifyRecoveryFiles(manifestFile, key), raw);
    const changed = await readFile(artifact);
    changed[0] ^= 1;
    await writeFile(artifact, changed);
    await assert.rejects(
      verifyRecoveryFiles(manifestFile, key),
      /BACKUP_BYTES_MISMATCH/,
    );
    await writeFile(artifact, Buffer.concat([bytes, Buffer.from('extra')]));
    await assert.rejects(
      verifyRecoveryFiles(manifestFile, key),
      /BACKUP_BYTES_MISMATCH/,
    );
    await writeFile(manifestFile, 'x'.repeat(4097));
    await assert.rejects(
      verifyRecoveryFiles(manifestFile, key),
      /INVALID_BACKUP_MANIFEST/,
    );
  } finally {
    await rm(folder, { recursive: true, force: true });
  }
});
function fixture(createdAt = new Date(now).toISOString()) {
  return {
    format: 2,
    createdAt,
    file: `${createdAt.replaceAll(':', '-')}-00000000-0000-4000-8000-000000000001.sfbackup`,
    encryptedBytes: 190162,
    sha256: 'a'.repeat(64),
    tableDataEntries: 22,
    postgresImage: `postgres@sha256:${'b'.repeat(64)}`,
  };
}
test('authenticates every recovery descriptor field regardless of JSON key order', () => {
  const raw = fixture(),
    signed = signBackupManifest(raw, key);
  assert.deepEqual(verifyBackupManifest(signed, key, now), raw);
  const reversed = Object.fromEntries(Object.entries(signed).reverse());
  assert.deepEqual(verifyBackupManifest(reversed, key, now), raw);
  for (const [field, value] of Object.entries({
    createdAt: '2026-10-29T12:00:00.000Z',
    file: raw.file.replace('000000000001', '000000000002'),
    encryptedBytes: 190163,
    sha256: 'c'.repeat(64),
    tableDataEntries: 23,
    postgresImage: `postgres@sha256:${'c'.repeat(64)}`,
    signature: 'A'.repeat(43),
  }))
    assert.throws(() =>
      verifyBackupManifest({ ...signed, [field]: value }, key, now),
    );
  assert.throws(() =>
    verifyBackupManifest(signed, Buffer.alloc(32, 8).toString('base64'), now),
  );
});
test('rejects expired, future, unsigned, malformed and path-traversing recovery descriptors', () => {
  const signed = signBackupManifest(fixture(), key);
  assert.throws(
    () => verifyBackupManifest(signed, key, now + 30 * 86400000),
    /BACKUP_EXPIRED/,
  );
  assert.deepEqual(
    verifyBackupManifest(signed, key, now + 30 * 86400000 - 1),
    fixture(),
  );
  const future = signBackupManifest(
    fixture(new Date(now + 300001).toISOString()),
    key,
  );
  assert.throws(
    () => verifyBackupManifest(future, key, now),
    /INVALID_BACKUP_TIME/,
  );
  assert.throws(() => verifyBackupManifest(signed, key, NaN));
  assert.throws(() => verifyBackupManifest(fixture(), key, now));
  for (const raw of [
    null,
    [],
    { ...fixture(), format: 1 },
    { ...fixture(), extra: true },
    { ...fixture(), file: '../../.env' },
    { ...fixture(), file: 'nested/file.sfbackup' },
    { ...fixture(), file: fixture().file.replace('2026', '2025') },
    { ...fixture(), encryptedBytes: 0 },
    { ...fixture(), sha256: 'not-a-hash' },
    { ...fixture(), tableDataEntries: 0 },
    { ...fixture(), postgresImage: 'untrusted:latest' },
    { ...fixture(), createdAt: 'yesterday' },
  ])
    assert.throws(() => signBackupManifest(raw, key));
  for (const signature of ['', '!', 'A'.repeat(44), false])
    assert.throws(() =>
      verifyBackupManifest({ ...signed, signature }, key, now),
    );
  for (const secret of ['', 'invalid', Buffer.alloc(31).toString('base64')])
    assert.throws(() => signBackupManifest(fixture(), secret));
});
