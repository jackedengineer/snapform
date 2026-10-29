import { expect, it } from 'vitest';
import { sql } from 'drizzle-orm';
import { openDatabase } from '../src/client.ts';
it('keeps delivery outcomes outside application authority and hides unscoped rows', async () => {
  if (!process.env.DATABASE_URL) throw Error('Runtime database required');
  const { db, close } = await openDatabase(process.env.DATABASE_URL);
  try {
    expect(
      (
        await db.execute(
          sql`select has_table_privilege(current_user,'public.webhook_delivery','SELECT') as read,has_table_privilege(current_user,'public.webhook_delivery','INSERT') as preview,has_table_privilege(current_user,'public.webhook_delivery','UPDATE') as update,has_table_privilege(current_user,'public.webhook_delivery','DELETE') as remove,has_table_privilege('snapform_jobs','public.webhook_delivery','SELECT') as jobs_read`,
        )
      ).rows,
    ).toEqual([
      {
        read: true,
        preview: true,
        update: false,
        remove: false,
        jobs_read: false,
      },
    ]);
    expect(
      (
        await db.execute(
          sql`select has_function_privilege(current_user,'public.seed_response_webhook()','EXECUTE') as seed,has_function_privilege(current_user,'public.cancel_form_webhooks()','EXECUTE') as cancel,has_function_privilege('snapform_jobs','public.seed_response_webhook()','EXECUTE') as job_seed`,
        )
      ).rows,
    ).toEqual([{ seed: false, cancel: false, job_seed: false }]);
    expect(
      (await db.execute(sql`select id from public.webhook_delivery`)).rows,
    ).toEqual([]);
    await expect(
      db.execute(
        sql`insert into public.webhook_delivery(id,workspace_id,form_id,configuration_id,version_id,kind,status,payload,created_by) values(${crypto.randomUUID()}::uuid,${crypto.randomUUID()}::uuid,${crypto.randomUUID()}::uuid,${crypto.randomUUID()}::uuid,${crypto.randomUUID()}::uuid,'test','preview','{}',${crypto.randomUUID()})`,
      ),
    ).rejects.toMatchObject({ cause: { code: '42501' } });
  } finally {
    await close();
  }
}, 20000);
