import { expect, it } from 'vitest';
import { openDatabase } from '../src/client.ts';
import { user } from '../src/schema.ts';
import { createWorkspace } from '../src/workspaces.ts';
import { createForm } from '../src/forms.ts';
import { publishForm, unpublishForm } from '../src/publication.ts';
import { resolvePublicForm } from '../src/public-form.ts';
import { startIntake, getIntake, mutateIntake } from '../src/intake.ts';
import { scheduleDeletion, cancelDeletion } from '../src/deletion.ts';
import { formFixture } from '../../contracts/test/form-fixture.ts';

it('stops public collection for pending deletion and resumes only after cancellation', async () => {
  if (!process.env.DATABASE_URL) throw Error('Runtime database required');
  const { db, close } = await openDatabase(process.env.DATABASE_URL);
  const rollback = Error('Rollback deletion intake fixtures');
  try {
    await expect(
      db.transaction(async (tx) => {
        const actor = crypto.randomUUID(),
          workspaceId = crypto.randomUUID(),
          formId = crypto.randomUUID(),
          id = crypto.randomUUID(),
          otherId = crypto.randomUUID(),
          hash = 'a'.repeat(64);
        await tx.insert(user).values({
          id: actor,
          name: 'Deletion intake QA',
          email: `${actor}@example.invalid`,
          emailVerified: true,
        });
        await createWorkspace(tx, actor, {
          id: workspaceId,
          name: 'Deletion intake QA',
          segment: 'agency',
        });
        const fixture = formFixture();
        await createForm(tx, actor, workspaceId, {
          id: formId,
          definition: fixture.definition,
        });
        const published = await publishForm(tx, actor, workspaceId, formId, {
          versionId: crypto.randomUUID(),
          expectedRevision: 1,
        });
        if (!published.publication) throw Error('Publication required');
        const publicId = published.publication.publicId;
        await startIntake(tx, publicId, id, hash);
        await startIntake(tx, publicId, otherId, 'b'.repeat(64));
        const responseRequest = await scheduleDeletion(
          tx,
          actor,
          workspaceId,
          { kind: 'response', targetId: id },
          {
            requestId: crypto.randomUUID(),
            confirmation: 'DELETE',
            acknowledgeDeletion: true,
          },
        );
        await expect(getIntake(tx, publicId, id, hash)).rejects.toThrow(
          'INTAKE_UNAVAILABLE',
        );
        await expect(startIntake(tx, publicId, id, hash)).rejects.toThrow(
          'INTAKE_UNAVAILABLE',
        );
        await expect(
          mutateIntake(tx, publicId, id, hash, 'save', {
            operationId: crypto.randomUUID(),
            expectedRevision: 1,
            answers: {},
          }),
        ).rejects.toThrow('INTAKE_UNAVAILABLE');
        expect(await resolvePublicForm(tx, publicId)).not.toBeNull();
        expect(
          (await getIntake(tx, publicId, otherId, 'b'.repeat(64))).id,
        ).toBe(otherId);
        await cancelDeletion(tx, actor, workspaceId, responseRequest.id, {
          expectedRevision: 1,
        });
        expect((await getIntake(tx, publicId, id, hash)).id).toBe(id);
        const workspaceRequest = await scheduleDeletion(
          tx,
          actor,
          workspaceId,
          { kind: 'workspace', targetId: workspaceId },
          {
            requestId: crypto.randomUUID(),
            confirmation: 'Deletion intake QA',
            acknowledgeDeletion: true,
          },
        );
        expect(await resolvePublicForm(tx, publicId)).toBeNull();
        await expect(getIntake(tx, publicId, id, hash)).rejects.toThrow(
          'INTAKE_UNAVAILABLE',
        );
        await expect(
          startIntake(tx, publicId, crypto.randomUUID(), 'c'.repeat(64)),
        ).rejects.toThrow('INTAKE_UNAVAILABLE');
        await expect(
          mutateIntake(tx, publicId, otherId, 'b'.repeat(64), 'submit', {
            operationId: crypto.randomUUID(),
            expectedRevision: 1,
            answers: {},
          }),
        ).rejects.toThrow('INTAKE_UNAVAILABLE');
        await cancelDeletion(tx, actor, workspaceId, workspaceRequest.id, {
          expectedRevision: 1,
        });
        expect(await resolvePublicForm(tx, publicId)).not.toBeNull();
        expect((await getIntake(tx, publicId, id, hash)).revision).toBe(1);
        expect(
          (await startIntake(tx, publicId, crypto.randomUUID(), 'c'.repeat(64)))
            .status,
        ).toBe('collecting');
        await mutateIntake(tx, publicId, otherId, 'b'.repeat(64), 'submit', {
          operationId: crypto.randomUUID(),
          expectedRevision: 1,
          answers: {
            [fixture.ids.budget]: { state: 'value', value: 0 },
            [fixture.ids.contact]: {
              state: 'value',
              value: 'qa@example.invalid',
            },
          },
        });
        await unpublishForm(tx, actor, workspaceId, formId, {
          expectedVersionId: published.versionId,
        });
        // A submitted receipt remains recoverable after ordinary unpublication.
        expect(
          (await startIntake(tx, publicId, otherId, 'b'.repeat(64))).status,
        ).toBe('submitted');
        await expect(
          startIntake(tx, publicId, crypto.randomUUID(), 'e'.repeat(64)),
        ).rejects.toThrow('INTAKE_UNAVAILABLE');
        throw rollback;
      }),
    ).rejects.toBe(rollback);
  } finally {
    await close();
  }
}, 30000);
