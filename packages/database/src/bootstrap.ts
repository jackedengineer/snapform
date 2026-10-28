import { randomBytes } from 'node:crypto';
import { existsSync } from 'node:fs';
import { writeFile } from 'node:fs/promises';
import { sql } from 'drizzle-orm';
import { openDatabase } from './client.ts';

const runtimeFile = new URL('../../../apps/api/.dev.vars', import.meta.url);
if (existsSync(runtimeFile)) {
  console.log(
    'Existing runtime configuration preserved. Run database tests to verify it.',
  );
} else {
  if (!process.env.DATABASE_MIGRATION_URL)
    throw new Error('Configure the ignored migration environment first.');
  const password = randomBytes(32).toString('base64url');
  const { db, close } = openDatabase(process.env.DATABASE_MIGRATION_URL);
  try {
    await db.transaction(async (tx) => {
      await tx.execute(
        sql`select pg_advisory_xact_lock(hashtext('snapform.runtime.bootstrap'))`,
      );
      const role = await tx.execute<{ rolcanlogin: boolean }>(
        sql`select rolcanlogin from pg_roles where rolname = 'snapform_runtime'`,
      );
      if (!role.rows[0] || role.rows[0].rolcanlogin)
        throw new Error(
          'Runtime role is missing or already configured; credentials were not rotated.',
        );
      await tx.execute(
        sql`select set_config('snapform.bootstrap_password', ${password}, true)`,
      );
      await tx.execute(
        sql`DO $$ BEGIN EXECUTE format('ALTER ROLE snapform_runtime LOGIN PASSWORD %L', current_setting('snapform.bootstrap_password')); END $$`,
      );
    });
    const url = new URL(process.env.DATABASE_MIGRATION_URL);
    url.username = 'snapform_runtime';
    url.password = password;
    const secret = randomBytes(32).toString('base64url');
    await writeFile(
      runtimeFile,
      `DATABASE_URL=${JSON.stringify(url.toString())}\nBETTER_AUTH_SECRET=${JSON.stringify(secret)}\nBETTER_AUTH_URL="http://127.0.0.1:5173"\n`,
      { mode: 0o600, flag: 'wx' },
    );
    console.log(
      'Restricted runtime connection and auth secret saved outside Git.',
    );
  } finally {
    await close();
  }
}
