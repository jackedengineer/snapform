import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { createRecoveryBackup } from './backup-postgres.mjs';
import {
  publishBackupToR2,
  validateR2BackupCredentials,
} from './backup-r2.mjs';
import { archiveKey } from './recovery-archive.mjs';

export async function backupToR2(environment) {
  for (const field of [
    'DATABASE_BACKUP_URL',
    'BACKUP_ENCRYPTION_KEY',
    'CLOUDFLARE_ACCOUNT_ID',
    'R2_BACKUP_ACCESS_KEY_ID',
    'R2_BACKUP_SECRET_ACCESS_KEY',
  ])
    if (!environment[field]) throw Error('BACKUP_CONFIGURATION_REQUIRED');
  if (new URL(environment.DATABASE_BACKUP_URL).username !== 'snapform_backup')
    throw Error('RESTRICTED_BACKUP_IDENTITY_REQUIRED');
  validateR2BackupCredentials({
    accountId: environment.CLOUDFLARE_ACCOUNT_ID,
    accessKeyId: environment.R2_BACKUP_ACCESS_KEY_ID,
    secretAccessKey: environment.R2_BACKUP_SECRET_ACCESS_KEY,
  });
  archiveKey(environment.BACKUP_ENCRYPTION_KEY);
  const directory = await mkdtemp(join(tmpdir(), 'snapform-nightly-'));
  try {
    const local = await createRecoveryBackup({
      connectionString: environment.DATABASE_BACKUP_URL,
      secret: environment.BACKUP_ENCRYPTION_KEY,
      outputDirectory: directory,
    });
    const remote = await publishBackupToR2(
      join(directory, local.file + '.json'),
      {
        secret: environment.BACKUP_ENCRYPTION_KEY,
        accountId: environment.CLOUDFLARE_ACCOUNT_ID,
        accessKeyId: environment.R2_BACKUP_ACCESS_KEY_ID,
        secretAccessKey: environment.R2_BACKUP_SECRET_ACCESS_KEY,
      },
    );
    return {
      createdAt: remote.manifest.createdAt,
      encryptedBytes: remote.manifest.encryptedBytes,
      tableDataEntries: remote.manifest.tableDataEntries,
    };
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}
if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(resolve(process.argv[1])).href
) {
  try {
    console.log(
      JSON.stringify({
        event: 'encrypted_backup_uploaded_verified',
        ...(await backupToR2(process.env)),
      }),
    );
  } catch {
    console.error(JSON.stringify({ event: 'encrypted_backup_remote_failed' }));
    process.exitCode = 1;
  }
}
