import { expect, it } from 'vitest';
import { sql } from 'drizzle-orm';
import { openDatabase } from '../src/client.ts';

it('separates dispatch authority from the application runtime and auth tables', async () => {
  if (!process.env.DATABASE_URL)
    throw new Error('Runtime database configuration required');
  const { db, close } = await openDatabase(process.env.DATABASE_URL);
  try {
    const role = await db.execute(
      sql`select rolcanlogin,rolsuper,rolcreatedb,rolcreaterole,rolinherit,rolbypassrls from pg_roles where rolname='snapform_jobs'`,
    );
    expect(role.rows).toEqual([
      {
        rolcanlogin: true,
        rolsuper: false,
        rolcreatedb: false,
        rolcreaterole: false,
        rolinherit: false,
        rolbypassrls: false,
      },
    ]);
    const privileges = await db.execute(sql`select
      has_function_privilege(current_user,'public.claim_response_events(integer,uuid)','EXECUTE') as app_dispatch,
      has_function_privilege('snapform_jobs','public.claim_response_events(integer,uuid)','EXECUTE') as job_dispatch,
      has_table_privilege('snapform_jobs','public.user','SELECT') as auth_read,
      has_table_privilege('snapform_jobs','public.response_session','SELECT') as response_read,
      has_table_privilege('snapform_jobs','public.response_outbox','UPDATE') as direct_dispatch_write,
      has_schema_privilege('snapform_jobs','public','CREATE') as schema_create`);
    expect(privileges.rows).toEqual([
      {
        app_dispatch: false,
        job_dispatch: true,
        auth_read: false,
        response_read: false,
        direct_dispatch_write: false,
        schema_create: false,
      },
    ]);
    await expect(
      db.execute(
        sql`select * from public.claim_response_events(1,${crypto.randomUUID()}::uuid)`,
      ),
    ).rejects.toMatchObject({ cause: { code: '42501' } });
  } finally {
    await close();
  }
}, 20000);
