import { expect, it } from 'vitest';
import { sql } from 'drizzle-orm';
import { openDatabase } from '../src/client.ts';
it('reserves provider delivery outcomes for the jobs identity', async () => {
  if (!process.env.DATABASE_URL) throw Error('Runtime database required');
  const { db, close } = await openDatabase(process.env.DATABASE_URL);
  try {
    await expect(
      db.execute(
        sql`select public.record_owner_provider_status(${crypto.randomUUID()}::uuid,${crypto.randomUUID()}::uuid,'qa@example.invalid','delivered')`,
      ),
    ).rejects.toMatchObject({ cause: { code: '42501' } });
    expect(
      (
        await db.execute(
          sql`select has_function_privilege('snapform_jobs','public.record_owner_provider_status(uuid,uuid,text,text)','EXECUTE') as jobs`,
        )
      ).rows,
    ).toEqual([{ jobs: true }]);
  } finally {
    await close();
  }
});
