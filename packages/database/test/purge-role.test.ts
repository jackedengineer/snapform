import { expect, it } from 'vitest';
import { sql } from 'drizzle-orm';
import { openDatabase } from '../src/client.ts';
it('reserves irreversible purge operations for Jobs and denies direct metadata access', async () => {
  if (!process.env.DATABASE_URL) throw Error('Runtime configuration required');
  const { db, close } = await openDatabase(process.env.DATABASE_URL);
  try {
    expect(
      (
        await db.execute(sql`select
      has_function_privilege(current_user,'public.claim_expired_responses(integer,uuid)','EXECUTE') as app_claim,
      has_function_privilege(current_user,'public.finalize_response_purge(uuid)','EXECUTE') as app_finalize,
      has_table_privilege(current_user,'public.purge_intent','SELECT') as app_read,
      has_table_privilege('snapform_jobs','public.purge_intent','UPDATE') as jobs_write,
      has_function_privilege('snapform_jobs','public.claim_expired_responses(integer,uuid)','EXECUTE') as jobs_claim,
      has_function_privilege('snapform_jobs','public.finalize_response_purge(uuid)','EXECUTE') as jobs_finalize`)
      ).rows,
    ).toEqual([
      {
        app_claim: false,
        app_finalize: false,
        app_read: false,
        jobs_write: false,
        jobs_claim: true,
        jobs_finalize: true,
      },
    ]);
    await expect(
      db.execute(
        sql`select * from public.claim_expired_responses(1,${crypto.randomUUID()}::uuid)`,
      ),
    ).rejects.toMatchObject({ cause: { code: '42501' } });
  } finally {
    await close();
  }
});
