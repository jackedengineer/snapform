import assert from 'node:assert/strict';
import { sql } from 'drizzle-orm';
import { openDatabase } from '../src/client.ts';
import { provisionBackupRole } from '../src/backup-role.ts';

if (!process.env.DATABASE_MIGRATION_URL)
  throw Error('Migration connection required');
const { db, close } = await openDatabase(process.env.DATABASE_MIGRATION_URL);
const rollback = Error('Rollback backup privilege verification');
let stage = 'provision';
try {
  await assert.rejects(
    db.transaction(async (tx) => {
      await provisionBackupRole(tx);
      await provisionBackupRole(tx);
      stage = 'role-flags';
      const flags = await tx.execute(
        sql`select rolsuper,rolcreatedb,rolcreaterole,rolinherit,rolreplication,rolbypassrls,rolconnlimit from pg_roles where rolname='snapform_backup'`,
      );
      assert.deepEqual(flags.rows, [
        {
          rolsuper: false,
          rolcreatedb: false,
          rolcreaterole: false,
          rolinherit: false,
          rolreplication: false,
          rolbypassrls: true,
          rolconnlimit: 2,
        },
      ]);
      stage = 'table-grants';
      const privileges = await tx.execute(sql`select
      count(*) filter (where not has_table_privilege('snapform_backup',c.oid,'SELECT'))::int as unreadable,
      count(*) filter (where has_table_privilege('snapform_backup',c.oid,'INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER'))::int as writable
      from pg_class c join pg_namespace n on n.oid=c.relnamespace
      where n.nspname in ('public','drizzle') and c.relkind in ('r','p')`);
      assert.deepEqual(privileges.rows, [{ unreadable: 0, writable: 0 }]);
      stage = 'function-grants';
      const functions = await tx.execute(
        sql`select count(*)::int as executable from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.prosecdef and has_function_privilege('snapform_backup',p.oid,'EXECUTE')`,
      );
      assert.deepEqual(functions.rows, [{ executable: 0 }]);
      stage = 'ownership-grants';
      const ownership = await tx.execute(sql`select
      exists(select 1 from pg_auth_members where member=(select oid from pg_roles where rolname='snapform_backup')) as membership,
      exists(select 1 from pg_class where relowner=(select oid from pg_roles where rolname='snapform_backup')) as owns_relations,
      has_schema_privilege('snapform_backup','public','CREATE') as can_create,
      has_schema_privilege('snapform_backup','drizzle','CREATE') as migration_create,
      has_database_privilege('snapform_backup',current_database(),'CREATE') as database_create`);
      assert.deepEqual(ownership.rows, [
        {
          membership: false,
          owns_relations: false,
          can_create: false,
          migration_create: false,
          database_create: false,
        },
      ]);
      stage = 'future-table';
      await tx.execute(
        sql`create table public.backup_privilege_probe(id integer)`,
      );
      const future = await tx.execute(
        sql`select has_table_privilege('snapform_backup','public.backup_privilege_probe','SELECT') as can_read,has_table_privilege('snapform_backup','public.backup_privilege_probe','INSERT') as can_write`,
      );
      assert.deepEqual(future.rows, [{ can_read: true, can_write: false }]);
      stage = 'ownership-rejection';
      const unwindOwnership = Error('Rollback ownership probe');
      await assert.rejects(
        tx.transaction(async (nested) => {
          await nested.execute(
            sql`DO $$ BEGIN EXECUTE format('GRANT snapform_backup TO %I',current_user); END $$`,
          );
          await nested.execute(
            sql`create schema backup_ownership_probe authorization snapform_backup`,
          );
          await assert.rejects(
            provisionBackupRole(nested),
            (error) =>
              error instanceof Error &&
              error.cause instanceof Error &&
              error.cause.message === 'UNSAFE_BACKUP_ROLE',
          );
          throw unwindOwnership;
        }),
        (error) => error === unwindOwnership,
      );
      stage = 'rollback';
      throw rollback;
    }),
    (error) => error === rollback,
  );
  console.log(
    JSON.stringify({
      event: 'backup_role_privileges_verified',
      rolledBack: true,
    }),
  );
} catch (error) {
  const cause = error instanceof Error ? error.cause : undefined;
  const code =
    cause && typeof cause === 'object' && 'code' in cause
      ? String(cause.code)
      : error instanceof Error && 'code' in error
        ? String(error.code)
        : 'unknown';
  console.error(
    JSON.stringify({ event: 'backup_role_verification_failed', stage, code }),
  );
  process.exitCode = 1;
} finally {
  await close();
}
