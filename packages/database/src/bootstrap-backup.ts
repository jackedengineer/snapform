import { randomBytes } from 'node:crypto';
import { readFile, appendFile, stat } from 'node:fs/promises';
import { parseEnv } from 'node:util';
import { sql } from 'drizzle-orm';
import { openDatabase } from './client.ts';
import { provisionBackupRole } from './backup-role.ts';

const file = new URL('../../../.env.backup', import.meta.url);
async function bootstrap() {
  if (!process.env.DATABASE_MIGRATION_URL)
    throw Error('MISSING_OWNER_CONFIGURATION');
  const source = new URL(process.env.DATABASE_MIGRATION_URL);
  const { db, close } = await openDatabase(source.toString());
  let connectionString: string | undefined;
  try {
    await db.transaction(async (tx) => {
      // Serialize file reads as well as role creation: concurrent first runs must
      // choose and save the same credential before either enables the login.
      await tx.execute(
        sql`select pg_advisory_xact_lock(hashtext('snapform.backup.bootstrap'))`,
      );
      const metadata = await stat(file);
      if ((metadata.mode & 0o077) !== 0)
        throw Error('PRIVATE_CONFIGURATION_REQUIRED');
      const config = parseEnv(await readFile(file, 'utf8'));
      if (!config.BACKUP_ENCRYPTION_KEY) throw Error('MISSING_RECOVERY_KEY');
      connectionString = config.DATABASE_BACKUP_URL;
      const existing = await tx.execute<{ rolcanlogin: boolean }>(
        sql`select rolcanlogin from pg_roles where rolname='snapform_backup'`,
      );
      if (!connectionString) {
        if (existing.rows[0]) throw Error('BACKUP_CREDENTIAL_HANDOFF_REQUIRED');
        const target = new URL(source);
        target.username = 'snapform_backup';
        target.password = randomBytes(32).toString('base64url');
        connectionString = target.toString();
        // Save desired credentials before enabling the login; a failed setup can retry
        // this same password, without stranding or silently rotating a live login.
        await appendFile(
          file,
          `\nDATABASE_BACKUP_URL=${JSON.stringify(connectionString)}\n`,
          { flush: true },
        );
      }
      const target = new URL(connectionString);
      if (
        target.username !== 'snapform_backup' ||
        !target.password ||
        target.host !== source.host ||
        target.pathname !== source.pathname ||
        target.searchParams.get('sslmode') !== 'require'
      )
        throw Error('INVALID_BACKUP_CONFIGURATION');
      await provisionBackupRole(tx);
      const role = await tx.execute<{ rolcanlogin: boolean }>(
        sql`select rolcanlogin from pg_roles where rolname='snapform_backup'`,
      );
      if (!role.rows[0]?.rolcanlogin) {
        await tx.execute(
          sql`select set_config('snapform.bootstrap_password',${decodeURIComponent(target.password)},true)`,
        );
        await tx.execute(
          sql`DO $$ BEGIN EXECUTE format('ALTER ROLE snapform_backup LOGIN PASSWORD %L',current_setting('snapform.bootstrap_password')); END $$`,
        );
      }
    });
  } finally {
    await close();
  }
  if (!connectionString) throw Error('MISSING_BACKUP_CONFIGURATION');
  const backup = await openDatabase(connectionString);
  try {
    const result = await backup.db.execute(
      sql`select current_user as identity,current_setting('transaction_read_only') as read_only`,
    );
    if (
      result.rows[0]?.identity !== 'snapform_backup' ||
      result.rows[0]?.read_only !== 'on'
    )
      throw Error('BACKUP_IDENTITY_NOT_READY');
  } finally {
    await backup.close();
  }
}
try {
  await bootstrap();
  console.log(JSON.stringify({ event: 'restricted_backup_identity_ready' }));
} catch {
  // Driver diagnostics can contain password query parameters. Never print them.
  console.error(JSON.stringify({ event: 'backup_identity_setup_failed' }));
  process.exitCode = 1;
}
