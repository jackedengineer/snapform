import { randomBytes } from 'node:crypto';
import { existsSync } from 'node:fs';
import { mkdir, writeFile } from 'node:fs/promises';
import { sql } from 'drizzle-orm';
import { openDatabase } from './client.ts';

const runtimeFile = new URL('../../../apps/jobs/.dev.vars', import.meta.url);
if (existsSync(runtimeFile)) {
  console.log(
    'Existing job configuration preserved; credentials were not rotated.',
  );
} else {
  if (!process.env.DATABASE_MIGRATION_URL)
    throw new Error('Configure the ignored migration environment first.');
  const password = randomBytes(32).toString('base64url');
  const { db, close } = await openDatabase(process.env.DATABASE_MIGRATION_URL);
  try {
    await db.transaction(async (tx) => {
      await tx.execute(
        sql`select pg_advisory_xact_lock(hashtext('snapform.jobs.bootstrap'))`,
      );
      const role = await tx.execute<{ rolcanlogin: boolean }>(
        sql`select rolcanlogin from pg_roles where rolname='snapform_jobs'`,
      );
      if (!role.rows[0] || role.rows[0].rolcanlogin)
        throw new Error(
          'Job role is missing or already configured; credentials were not rotated.',
        );
      await tx.execute(
        sql`select set_config('snapform.bootstrap_password',${password},true)`,
      );
      await tx.execute(
        sql`DO $$ BEGIN EXECUTE format('ALTER ROLE snapform_jobs LOGIN PASSWORD %L',current_setting('snapform.bootstrap_password')); END $$`,
      );
    });
    const url = new URL(process.env.DATABASE_MIGRATION_URL);
    url.username = 'snapform_jobs';
    url.password = password;
    await mkdir(new URL('../../../apps/jobs/', import.meta.url), {
      recursive: true,
    });
    await writeFile(
      runtimeFile,
      `DATABASE_URL=${JSON.stringify(url.toString())}\n`,
      { mode: 0o600, flag: 'wx' },
    );
    console.log(
      'Restricted job credentials saved outside Git; auth tables remain inaccessible.',
    );
  } finally {
    await close();
  }
}
