import { sql } from 'drizzle-orm';
import type { Transaction } from './client.ts';

// Operator-only: never imported by a Worker or supplied a runtime connection.
export async function provisionBackupRole(tx: Transaction) {
  await tx.execute(
    sql`select pg_advisory_xact_lock(hashtext('snapform.backup.bootstrap'))`,
  );
  await tx.execute(sql`DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='snapform_backup') THEN
      CREATE ROLE snapform_backup NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE
        NOINHERIT NOREPLICATION BYPASSRLS CONNECTION LIMIT 2;
    END IF;
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname='snapform_backup' AND
      (rolsuper OR rolcreatedb OR rolcreaterole OR rolinherit OR rolreplication OR NOT rolbypassrls))
      OR EXISTS (SELECT 1 FROM pg_auth_members WHERE member=(SELECT oid FROM pg_roles WHERE rolname='snapform_backup'))
      OR EXISTS (SELECT 1 FROM pg_shdepend WHERE refclassid='pg_authid'::regclass
        AND refobjid=(SELECT oid FROM pg_roles WHERE rolname='snapform_backup') AND deptype='o')
    THEN RAISE EXCEPTION 'UNSAFE_BACKUP_ROLE'; END IF;
  END $$`);
  await tx.execute(sql`ALTER ROLE snapform_backup CONNECTION LIMIT 2`);
  await tx.execute(
    sql`ALTER ROLE snapform_backup SET default_transaction_read_only = on`,
  );
  await tx.execute(
    sql`REVOKE ALL ON ALL TABLES IN SCHEMA public,drizzle FROM snapform_backup`,
  );
  await tx.execute(
    sql`REVOKE ALL ON ALL SEQUENCES IN SCHEMA public,drizzle FROM snapform_backup`,
  );
  await tx.execute(
    sql`REVOKE ALL ON ALL FUNCTIONS IN SCHEMA public FROM snapform_backup`,
  );
  await tx.execute(
    sql`REVOKE CREATE ON SCHEMA public,drizzle FROM snapform_backup`,
  );
  await tx.execute(
    sql`GRANT USAGE ON SCHEMA public,drizzle TO snapform_backup`,
  );
  await tx.execute(
    sql`GRANT SELECT ON ALL TABLES IN SCHEMA public,drizzle TO snapform_backup`,
  );
  await tx.execute(
    sql`GRANT SELECT ON ALL SEQUENCES IN SCHEMA public,drizzle TO snapform_backup`,
  );
  // Migrations run as this same owner; future tables remain included in dumps.
  await tx.execute(
    sql`ALTER DEFAULT PRIVILEGES IN SCHEMA public,drizzle GRANT SELECT ON TABLES TO snapform_backup`,
  );
  await tx.execute(
    sql`ALTER DEFAULT PRIVILEGES IN SCHEMA public,drizzle GRANT SELECT ON SEQUENCES TO snapform_backup`,
  );
  const unsafe = await tx.execute(sql`select
    has_schema_privilege('snapform_backup','public','CREATE')
    OR has_schema_privilege('snapform_backup','drizzle','CREATE')
    OR has_database_privilege('snapform_backup',current_database(),'CREATE')
    OR EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
      WHERE n.nspname='public' AND p.prosecdef AND has_function_privilege('snapform_backup',p.oid,'EXECUTE')) AS unsafe`);
  if (unsafe.rows[0]?.unsafe !== false) throw Error('UNSAFE_BACKUP_PRIVILEGES');
}
