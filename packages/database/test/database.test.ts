import { describe, expect, it } from 'vitest';
import { eq, sql } from 'drizzle-orm';
import { openDatabase } from '../src/client.ts';
import { user } from '../src/schema.ts';

const connectionString = process.env.DATABASE_URL;
if (!connectionString)
  throw new Error(
    'Configure the ignored runtime environment before database tests.',
  );
const rollback = new Error('Rollback synthetic test data');

describe('single Neon database foundation', () => {
  it('connects to the requested database through Drizzle', async () => {
    const { db, close } = openDatabase(connectionString);
    try {
      const result = await db.execute<{ name: string }>(
        sql`select current_database() as name`,
      );
      expect(result.rows[0].name).toBe('snapform');
    } finally {
      await close();
    }
  });
  it('rolls back synthetic identity writes without altering persisted users', async () => {
    const { db, close } = openDatabase(connectionString);
    const id = crypto.randomUUID();
    try {
      await expect(
        db.transaction(async (tx) => {
          await tx.insert(user).values({
            id,
            name: 'Synthetic QA',
            email: `${id}@example.invalid`,
          });
          expect(
            await tx.select().from(user).where(eq(user.id, id)),
          ).toHaveLength(1);
          throw rollback;
        }),
      ).rejects.toBe(rollback);
      expect(await db.select().from(user).where(eq(user.id, id))).toHaveLength(
        0,
      );
    } finally {
      await close();
    }
  });
  it('enforces unique identities atomically and rolls the failed transaction back', async () => {
    const { db, close } = openDatabase(connectionString);
    const id = crypto.randomUUID();
    const email = `${id}@example.invalid`;
    try {
      await expect(
        db.transaction(async (tx) => {
          await tx.insert(user).values({ id, name: 'Synthetic QA', email });
          await tx
            .insert(user)
            .values({ id: crypto.randomUUID(), name: 'Duplicate QA', email });
        }),
      ).rejects.toThrow();
      expect(
        await db.select().from(user).where(eq(user.email, email)),
      ).toHaveLength(0);
    } finally {
      await close();
    }
  });
  it('uses a runtime login without administrative capabilities', async () => {
    const { db, close } = openDatabase(connectionString);
    try {
      const result = await db.execute<{
        rolname: string;
        rolsuper: boolean;
        rolcreatedb: boolean;
        rolcreaterole: boolean;
        rolbypassrls: boolean;
      }>(
        sql`select rolname, rolsuper, rolcreatedb, rolcreaterole, rolbypassrls from pg_roles where rolname = current_user`,
      );
      expect(result.rows[0]).toEqual({
        rolname: 'snapform_runtime',
        rolsuper: false,
        rolcreatedb: false,
        rolcreaterole: false,
        rolbypassrls: false,
      });
    } finally {
      await close();
    }
  });
  it('cannot create schema objects, even inside a rolled-back transaction', async () => {
    const { db, close } = openDatabase(connectionString);
    try {
      await expect(
        db.transaction(async (tx) => {
          await tx.execute(
            sql`create table ${sql.identifier('qa_' + crypto.randomUUID().replaceAll('-', '_'))} (id text)`,
          );
          throw rollback;
        }),
      ).rejects.toMatchObject({ cause: { code: '42501' } });
    } finally {
      await close();
    }
  });
  it('rejects missing or non-Neon connections without reflecting credentials', () => {
    for (const value of [
      '',
      'https://example.test',
      'postgresql://synthetic:private@example.test/db',
    ]) {
      expect(() => openDatabase(value)).toThrow(
        'A valid secure Neon connection is required.',
      );
    }
  });
});
