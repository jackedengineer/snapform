import { expect, it } from 'vitest';
import { sql } from 'drizzle-orm';
import { openDatabase } from '../src/client.ts';
import type { Transaction } from '../src/client.ts';
import { user } from '../src/schema.ts';
import { createWorkspace } from '../src/workspaces.ts';
import { createForm } from '../src/forms.ts';
import { publishForm } from '../src/publication.ts';
import { startIntake } from '../src/intake.ts';
import { workspaceResponseUsage } from '../src/billing-schema.ts';
import { formFixture } from '../../contracts/test/form-fixture.ts';
async function fixture(
  expired: boolean,
  run: (
    tx: Transaction,
    actor: string,
    workspaceId: string,
    publicId: string,
  ) => Promise<void>,
) {
  if (!process.env.DATABASE_URL)
    throw new Error('Runtime database configuration is required');
  const { db, close } = await openDatabase(process.env.DATABASE_URL),
    rollback = new Error('Rollback reservation fixtures');
  try {
    await expect(
      db.transaction(async (tx) => {
        const actor = crypto.randomUUID();
        await tx.insert(user).values({
          id: actor,
          name: 'Reservation QA',
          email: `${actor}@example.invalid`,
          emailVerified: true,
          ...(expired
            ? { createdAt: new Date(Date.now() - 15 * 86400000) }
            : {}),
        });
        const workspace = await createWorkspace(tx, actor, {
          id: crypto.randomUUID(),
          name: 'Reservation QA',
          segment: 'agency',
        });
        const id = crypto.randomUUID();
        await createForm(tx, actor, workspace.id, {
          id,
          definition: formFixture().definition,
        });
        const publication = await publishForm(tx, actor, workspace.id, id, {
          versionId: crypto.randomUUID(),
          expectedRevision: 1,
        });
        if (!publication.publication) throw new Error('Expected publication');
        await run(tx, actor, workspace.id, publication.publication.publicId);
        throw rollback;
      }),
    ).rejects.toBe(rollback);
  } finally {
    await close();
  }
}
const hashes = (workspaceId: string) =>
  sql`replace(${workspaceId}::text,'-','') || lpad(to_hex(n),32,'0')`;
const capability = () => crypto.randomUUID().replaceAll('-', '').repeat(2);
it(
  'reserves the Free monthly allowance and then reports the form as not accepting',
  async () =>
    fixture(false, async (tx, _actor, workspaceId, publicId) => {
      const reserved = await tx.execute<{ id: string | null }>(
        sql`select public.start_response_session(${publicId}::uuid,gen_random_uuid(),${hashes(workspaceId)}) as id from generate_series(1,100) n`,
      );
      expect(reserved.rows.filter((row) => row.id)).toHaveLength(100);
      await expect(
        tx.transaction((attempt) =>
          startIntake(attempt, publicId, crypto.randomUUID(), capability()),
        ),
      ).rejects.toThrow('FORM_NOT_ACCEPTING');
    }),
  30000,
);
it(
  'keeps collecting for a creator who signed up before the old trial window',
  async () =>
    fixture(true, async (tx, _actor, _workspaceId, publicId) => {
      const id = crypto.randomUUID();
      expect((await startIntake(tx, publicId, id, capability())).status).toBe(
        'collecting',
      );
    }),
  30000,
);
it(
  'gives each workspace its own monthly allowance',
  async () =>
    fixture(false, async (tx, actor, workspaceId, publicId) => {
      await tx.execute(
        sql`select public.start_response_session(${publicId}::uuid,gen_random_uuid(),${hashes(workspaceId)}) from generate_series(1,100) n`,
      );
      const other = await createWorkspace(tx, actor, {
          id: crypto.randomUUID(),
          name: 'Second reservation QA',
          segment: 'coach',
        }),
        id = crypto.randomUUID();
      await createForm(tx, actor, other.id, {
        id,
        definition: formFixture().definition,
      });
      const publication = await publishForm(tx, actor, other.id, id, {
        versionId: crypto.randomUUID(),
        expectedRevision: 1,
      });
      if (!publication.publication) throw new Error('Expected publication');
      expect(
        (
          await startIntake(
            tx,
            publication.publication.publicId,
            crypto.randomUUID(),
            capability(),
          )
        ).status,
      ).toBe('collecting');
    }),
  30000,
);
it(
  'does not allow the runtime to read or reset monthly usage directly',
  async () =>
    fixture(false, async (tx, _actor, _workspaceId, publicId) => {
      await startIntake(tx, publicId, crypto.randomUUID(), capability());
      await expect(
        tx.transaction(async (nested) => {
          await nested.update(workspaceResponseUsage).set({ responsesUsed: 0 });
        }),
      ).rejects.toMatchObject({ cause: { code: '42501' } });
      await expect(
        tx.transaction((nested) =>
          nested.select().from(workspaceResponseUsage),
        ),
      ).rejects.toMatchObject({ cause: { code: '42501' } });
    }),
  30000,
);
