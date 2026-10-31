import { createHmac, createHash, hkdfSync, timingSafeEqual } from 'node:crypto';
import { readFile, stat } from 'node:fs/promises';
import { createReadStream } from 'node:fs';
import { dirname, join } from 'node:path';
import { archiveKey } from './recovery-archive.mjs';
export const backupFilenamePattern =
  /^\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}\.\d{3}Z-[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.sfbackup$/;
const fields = [
  'format',
  'createdAt',
  'file',
  'encryptedBytes',
  'sha256',
  'tableDataEntries',
  'postgresImage',
];
const lifetime = 30 * 86400000;
function descriptor(raw, signed) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw))
    throw Error('INVALID_BACKUP_MANIFEST');
  const allowed = signed ? [...fields, 'signature'] : fields;
  if (
    Object.keys(raw).length !== allowed.length ||
    !allowed.every((field) => Object.hasOwn(raw, field))
  )
    throw Error('INVALID_BACKUP_MANIFEST');
  const {
    format,
    createdAt,
    file,
    encryptedBytes,
    sha256,
    tableDataEntries,
    postgresImage,
  } = raw;
  if (
    format !== 2 ||
    typeof createdAt !== 'string' ||
    !Number.isFinite(Date.parse(createdAt)) ||
    new Date(createdAt).toISOString() !== createdAt ||
    typeof file !== 'string' ||
    !backupFilenamePattern.test(file) ||
    !file.startsWith(createdAt.replaceAll(':', '-') + '-') ||
    !Number.isSafeInteger(encryptedBytes) ||
    encryptedBytes <= 0 ||
    typeof sha256 !== 'string' ||
    !/^[0-9a-f]{64}$/.test(sha256) ||
    !Number.isSafeInteger(tableDataEntries) ||
    tableDataEntries <= 0 ||
    typeof postgresImage !== 'string' ||
    !/^postgres@sha256:[0-9a-f]{64}$/.test(postgresImage)
  )
    throw Error('INVALID_BACKUP_MANIFEST');
  return {
    format,
    createdAt,
    file,
    encryptedBytes,
    sha256,
    tableDataEntries,
    postgresImage,
  };
}
function authenticate(manifest, secret) {
  const key = hkdfSync(
    'sha256',
    archiveKey(secret),
    Buffer.alloc(0),
    'snapform-backup-manifest-v2',
    32,
  );
  return createHmac('sha256', key).update(JSON.stringify(manifest)).digest();
}
export function signBackupManifest(raw, secret) {
  const manifest = descriptor(raw, false);
  return {
    ...manifest,
    signature: authenticate(manifest, secret).toString('base64url'),
  };
}
export function verifyBackupManifest(raw, secret, now = Date.now()) {
  const manifest = descriptor(raw, true);
  if (
    typeof raw.signature !== 'string' ||
    !/^[A-Za-z0-9_-]{43}$/.test(raw.signature)
  )
    throw Error('INVALID_BACKUP_MANIFEST');
  const signature = Buffer.from(raw.signature, 'base64url');
  if (
    signature.length !== 32 ||
    signature.toString('base64url') !== raw.signature ||
    !timingSafeEqual(signature, authenticate(manifest, secret))
  )
    throw Error('INVALID_BACKUP_MANIFEST');
  const age = now - Date.parse(manifest.createdAt);
  if (!Number.isFinite(now) || now <= 0 || age < -300000)
    throw Error('INVALID_BACKUP_TIME');
  if (age >= lifetime) throw Error('BACKUP_EXPIRED');
  return manifest;
}
export async function verifyRecoveryFiles(manifestPath, secret) {
  if ((await stat(manifestPath)).size > 4096)
    throw Error('INVALID_BACKUP_MANIFEST');
  const manifest = verifyBackupManifest(
    JSON.parse(await readFile(manifestPath, 'utf8')),
    secret,
  );
  const archive = join(dirname(manifestPath), manifest.file);
  if ((await stat(archive)).size !== manifest.encryptedBytes)
    throw Error('BACKUP_BYTES_MISMATCH');
  const hash = createHash('sha256');
  let bytes = 0;
  for await (const chunk of createReadStream(archive)) {
    bytes += chunk.length;
    if (bytes > manifest.encryptedBytes) throw Error('BACKUP_BYTES_MISMATCH');
    hash.update(chunk);
  }
  if (
    bytes !== manifest.encryptedBytes ||
    hash.digest('hex') !== manifest.sha256
  )
    throw Error('BACKUP_BYTES_MISMATCH');
  return manifest;
}
