import { expect, it } from 'vitest';
import { eq, sql } from 'drizzle-orm';
import { openDatabase } from '../src/client.ts';
import type { Transaction } from '../src/client.ts';
import { user } from '../src/schema.ts';
import { workspace, membership } from '../src/workspace-schema.ts';
import {
  createWorkspace,
  listWorkspaces,
  inWorkspace,
} from '../src/workspaces.ts';

const configuredConnection = process.env.DATABASE_URL;
if (!configuredConnection)
  throw new Error('Runtime database configuration is required.');
const connection = configuredConnection;
async function fixture(
  run: (tx: Transaction, first: string, second: string) => Promise<void>,
) {
  const { db, close } = await openDatabase(connection);
  const rollback = new Error('Rollback workspace fixtures');
  try {
    try {
      await db.transaction(async (tx) => {
        const first = crypto.randomUUID(),
          second = crypto.randomUUID();
        await tx.insert(user).values(
          [first, second].map((id) => ({
            id,
            name: 'Workspace QA',
            email: `${id}@example.invalid`,
            emailVerified: true,
          })),
        );
        await run(tx, first, second);
        throw rollback;
      });
    } catch (error) {
      if (error !== rollback) throw error;
    }
  } finally {
    await close();
  }
}
it(
  'atomically creates an owner and safely deduplicates repeated creation',
  async () =>
    fixture(async (tx, first, second) => {
      const input = {
        id: crypto.randomUUID(),
        name: 'Synthetic Agency',
        segment: 'agency' as const,
      };
      expect((await createWorkspace(tx, first, input)).role).toBe('owner');
      expect((await createWorkspace(tx, first, input)).id).toBe(input.id);
      expect(await listWorkspaces(tx, first)).toHaveLength(1);
      await expect(createWorkspace(tx, second, input)).rejects.toThrow(
        'WORKSPACE_CONFLICT',
      );
      expect(await listWorkspaces(tx, second)).toHaveLength(0);
    }),
  20000,
);
it(
  'blocks cross-tenant access and a viewer write through real RLS and policy',
  async () =>
    fixture(async (tx, first, second) => {
      const a = await createWorkspace(tx, first, {
        id: crypto.randomUUID(),
        name: 'First QA',
        segment: 'agency',
      });
      const b = await createWorkspace(tx, second, {
        id: crypto.randomUUID(),
        name: 'Second QA',
        segment: 'startup',
      });
      await inWorkspace(tx, first, a.id, 'members.manage', async (scoped) => {
        await scoped
          .insert(membership)
          .values({ workspaceId: a.id, userId: second, role: 'viewer' });
        expect(
          await scoped.select().from(workspace).where(eq(workspace.id, b.id)),
        ).toHaveLength(0);
        await expect(
          scoped.transaction(async (savepoint) => {
            await savepoint
              .insert(membership)
              .values({ workspaceId: b.id, userId: first, role: 'owner' });
          }),
        ).rejects.toMatchObject({ cause: { code: '42501' } });
      });
      await expect(
        inWorkspace(tx, first, b.id, 'responses.read', async () => null),
      ).rejects.toThrow('WORKSPACE_NOT_FOUND');
      await expect(
        inWorkspace(tx, second, a.id, 'forms.write', async () => null),
      ).rejects.toThrow('FORBIDDEN');
      expect(
        await inWorkspace(tx, second, a.id, 'responses.read', async (scoped) =>
          scoped.select().from(membership),
        ),
      ).toHaveLength(2);
    }),
  20000,
);
it('leaves no tenant identity on the next transaction or unscoped query', async () => {
  await fixture(async (tx, first) => {
    await createWorkspace(tx, first, {
      id: crypto.randomUUID(),
      name: 'Context QA',
      segment: 'coach',
    });
  });
  const { db, close } = await openDatabase(connection);
  try {
    expect(await db.select().from(workspace)).toHaveLength(0);
    expect(await db.select().from(membership)).toHaveLength(0);
    const state = await db.execute<{
      identity: string | null;
      tenant: string | null;
    }>(
      sql`select nullif(current_setting('snapform.user_id', true), '') as identity, nullif(current_setting('snapform.workspace_id', true), '') as tenant`,
    );
    expect(state.rows[0]).toEqual({ identity: null, tenant: null });
  } finally {
    await close();
  }
}, 20000);
it('clears transaction-local context before reusing the same database connection', async () => {
  const { db, close } = await openDatabase(connection);
  let originalPid: number | undefined;
  try {
    await db.transaction(async (tx) => {
      const result = await tx.execute<{ pid: number }>(
        sql`select pg_backend_pid() as pid, set_config('snapform.user_id', 'qa-context-only', true), set_config('snapform.workspace_id', ${crypto.randomUUID()}, true), set_config('snapform.role', 'owner', true)`,
      );
      originalPid = result.rows[0].pid;
    });
    const result = await db.execute<{
      pid: number;
      identity: string | null;
      tenant: string | null;
      role: string | null;
    }>(
      sql`select pg_backend_pid() as pid, nullif(current_setting('snapform.user_id', true), '') as identity, nullif(current_setting('snapform.workspace_id', true), '') as tenant, nullif(current_setting('snapform.role', true), '') as role`,
    );
    expect(result.rows[0]).toEqual({
      pid: originalPid,
      identity: null,
      tenant: null,
      role: null,
    });
  } finally {
    await close();
  }
}, 20000);
