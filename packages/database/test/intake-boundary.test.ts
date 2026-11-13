import { expect, it } from 'vitest';
import { sql } from 'drizzle-orm';
import type { IntakeMutation } from '../../contracts/src/intake-progress.ts';
import { openDatabase } from '../src/client.ts';
import { inWorkspace } from '../src/workspaces.ts';
import { publishForm } from '../src/publication.ts';
import { startIntake, getIntake, mutateIntake } from '../src/intake.ts';
import { seedForm, seedResponses } from './fixtures/forms.ts';

it('authorizes each intake statement and rolls rejected effects back without losing atomic submission', async () => {
  if (!process.env.DATABASE_URL) throw Error('Runtime database required');
  const { db, close } = await openDatabase(process.env.DATABASE_URL);
  const rollback = Error('Rollback intake boundary fixtures');
  try {
    await expect(
      db.transaction(async (tx) => {
        const first = await seedResponses(tx),
          second = await seedForm(tx, 'Other intake QA');
        const publication = await publishForm(
          tx,
          second.actor,
          second.workspaceId,
          second.formId,
          { versionId: crypto.randomUUID(), expectedRevision: 1 },
        );
        if (!publication.publication) throw Error('Publication required');
        // A session-ID collision occurs after the canonical admission function
        // touches this workspace's monthly counter. Rejection must undo it and
        // leave no reservation behind.
        await expect(
          startIntake(
            tx,
            publication.publication.publicId,
            first.ids[0],
            'c'.repeat(64),
          ),
        ).rejects.toThrow('INTAKE_UNAVAILABLE');
        expect(
          await inWorkspace(
            tx,
            second.actor,
            second.workspaceId,
            'responses.read',
            async (scoped) =>
              (
                await scoped.execute(
                  sql`select responses_used as used,responses_reserved as reserved from public.workspace_billing(${second.workspaceId}::uuid)`,
                )
              ).rows,
          ),
        ).toEqual([{ used: 0, reserved: 0 }]);
        await expect(
          getIntake(tx, first.publicId, first.partial, 'f'.repeat(64)),
        ).rejects.toThrow('INTAKE_UNAVAILABLE');
        expect(
          (
            await tx.execute(
              sql`select current_setting('snapform.user_id') as actor,current_setting('snapform.workspace_id') as workspace`,
            )
          ).rows,
        ).toEqual([{ actor: second.actor, workspace: second.workspaceId }]);
        const input = {
          operationId: crypto.randomUUID(),
          expectedRevision: 1,
          answers: {
            [first.fieldIds.budget]: { state: 'value', value: 0 },
            [first.fieldIds.contact]: {
              state: 'value',
              value: 'qa@example.invalid',
            },
          },
        } satisfies IntakeMutation;
        await expect(
          mutateIntake(
            tx,
            first.publicId,
            first.partial,
            'e'.repeat(64),
            'submit',
            {
              ...input,
              expectedRevision: 99,
            },
          ),
        ).rejects.toThrow('INTAKE_CONFLICT');
        async function counters() {
          return inWorkspace(
            tx,
            first.actor,
            first.workspaceId,
            'responses.read',
            async (scoped) =>
              (
                await scoped.execute(
                  sql`select (select responses_used from public.workspace_billing(${first.workspaceId}::uuid)) as used,(select count(*)::int from public.response_outbox where session_id=${first.partial}::uuid) as events`,
                )
              ).rows,
          );
        }
        expect(await counters()).toEqual([{ used: 2, events: 0 }]);
        const receipt = await mutateIntake(
          tx,
          first.publicId,
          first.partial,
          'e'.repeat(64),
          'submit',
          input,
        );
        expect(receipt).toMatchObject({ revision: 2, status: 'submitted' });
        expect(
          await mutateIntake(
            tx,
            first.publicId,
            first.partial,
            'e'.repeat(64),
            'submit',
            input,
          ),
        ).toEqual(receipt);
        expect(await counters()).toEqual([{ used: 3, events: 1 }]);
        expect(
          (
            await tx.execute(
              sql`select has_function_privilege('snapform_runtime','public.scope_intake_request(uuid,uuid,text)','EXECUTE') as direct_scope,has_function_privilege('snapform_jobs','public.open_intake_session(uuid,uuid,text)','EXECUTE') as jobs_open`,
            )
          ).rows,
        ).toEqual([{ direct_scope: false, jobs_open: false }]);
        throw rollback;
      }),
    ).rejects.toBe(rollback);
  } finally {
    await close();
  }
}, 30000);
