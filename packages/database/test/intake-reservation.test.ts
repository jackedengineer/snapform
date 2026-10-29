import { expect, it } from 'vitest';
import { sql } from 'drizzle-orm';
import { openDatabase } from '../src/client.ts';
import type { Transaction } from '../src/client.ts';
import { user } from '../src/schema.ts';
import { createWorkspace } from '../src/workspaces.ts';
import { createForm } from '../src/forms.ts';
import { publishForm } from '../src/publication.ts';
import { startIntake } from '../src/intake.ts';
import { trialResponseUsage } from '../src/intake-schema.ts';
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
it(
  'reserves fifty trial response slots and refuses another without billing an overage',
  async () =>
    fixture(false, async (tx, _actor, workspaceId, publicId) => {
      const reserved = await tx.execute<{ id: string | null }>(
        sql`select public.start_response_session(${publicId}::uuid,gen_random_uuid(),replace(${workspaceId}::text,'-','') || lpad(to_hex(n),32,'0')) as id from generate_series(1,50) n`,
      );
      expect(reserved.rows.filter((row) => row.id)).toHaveLength(50);
      await expect(
        startIntake(
          tx,
          publicId,
          crypto.randomUUID(),
          crypto.randomUUID().replaceAll('-', '').repeat(2),
        ),
      ).rejects.toThrow('INTAKE_UNAVAILABLE');
    }),
  30000,
);
it(
  'does not restart an expired creator trial by creating another workspace',
  async () =>
    fixture(true, async (tx, _actor, _workspaceId, publicId) => {
      await expect(
        startIntake(
          tx,
          publicId,
          crypto.randomUUID(),
          crypto.randomUUID().replaceAll('-', '').repeat(2),
        ),
      ).rejects.toThrow('INTAKE_UNAVAILABLE');
    }),
  30000,
);
it(
  'shares the one trial allowance across a creator’s workspaces',
  async () =>
    fixture(false, async (tx, actor, workspaceId, publicId) => {
      await tx.execute(
        sql`select public.start_response_session(${publicId}::uuid,gen_random_uuid(),replace(${workspaceId}::text,'-','') || lpad(to_hex(n),32,'0')) from generate_series(1,50) n`,
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
      await expect(
        startIntake(
          tx,
          publication.publication.publicId,
          crypto.randomUUID(),
          crypto.randomUUID().replaceAll('-', '').repeat(2),
        ),
      ).rejects.toThrow('INTAKE_UNAVAILABLE');
    }),
  30000,
);
it(
  'does not allow the runtime to reset consumed trial usage',
  async () =>
    fixture(false, async (tx, _actor, _workspaceId, publicId) => {
      await startIntake(
        tx,
        publicId,
        crypto.randomUUID(),
        crypto.randomUUID().replaceAll('-', '').repeat(2),
      );
      await expect(
        tx.transaction(async (nested) => {
          await nested.update(trialResponseUsage).set({ responsesUsed: 0 });
        }),
      ).rejects.toMatchObject({ cause: { code: '42501' } });
    }),
  30000,
);
