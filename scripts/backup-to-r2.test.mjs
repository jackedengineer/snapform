import { test } from 'node:test';
import assert from 'node:assert/strict';
import { backupToR2 } from './backup-to-r2.mjs';
const configured = {
  DATABASE_BACKUP_URL:
    'postgresql://snapform_backup:synthetic@example.invalid/snapform?sslmode=require',
  BACKUP_ENCRYPTION_KEY: Buffer.alloc(32, 7).toString('base64'),
  CLOUDFLARE_ACCOUNT_ID: 'a'.repeat(32),
  R2_BACKUP_ACCESS_KEY_ID: 'b'.repeat(32),
  R2_BACKUP_SECRET_ACCESS_KEY: 'c'.repeat(64),
  R2_PURGE_ACCESS_KEY_ID: 'd'.repeat(32),
  R2_PURGE_SECRET_ACCESS_KEY: 'e'.repeat(64),
  PURGE_LEDGER_KEY: Buffer.alloc(32, 8).toString('base64'),
};
test('rejects incomplete or owner configuration before creating an export', async () => {
  await assert.rejects(backupToR2({}), /BACKUP_CONFIGURATION_REQUIRED/);
  await assert.rejects(
    backupToR2({
      ...configured,
      DATABASE_BACKUP_URL: configured.DATABASE_BACKUP_URL.replace(
        'snapform_backup',
        'neondb_owner',
      ),
    }),
    /RESTRICTED_BACKUP_IDENTITY_REQUIRED/,
  );
});
test('validates remote credentials before attempting database or Docker work', async () => {
  await assert.rejects(
    backupToR2({ ...configured, R2_BACKUP_ACCESS_KEY_ID: 'invalid' }),
    /INVALID_R2_BACKUP_REQUEST/,
  );
});
test('requires read-only ledger credentials and its encryption key before export', async () => {
  for (const field of [
    'R2_PURGE_ACCESS_KEY_ID',
    'R2_PURGE_SECRET_ACCESS_KEY',
    'PURGE_LEDGER_KEY',
  ]) {
    await assert.rejects(
      backupToR2({ ...configured, [field]: '' }),
      /BACKUP_CONFIGURATION_REQUIRED/,
    );
  }
  await assert.rejects(
    backupToR2({ ...configured, R2_PURGE_ACCESS_KEY_ID: 'invalid' }),
    /R2_PURGE_REQUEST_INVALID/,
  );
  await assert.rejects(
    backupToR2({ ...configured, PURGE_LEDGER_KEY: 'invalid' }),
    /INVALID_PURGE_LEDGER_KEY/,
  );
});
