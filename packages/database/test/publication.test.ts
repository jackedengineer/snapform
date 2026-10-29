import { expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import { openDatabase } from '../src/client.ts';
import type { Transaction } from '../src/client.ts';
import { user } from '../src/schema.ts';
import { membership } from '../src/workspace-schema.ts';
import { createWorkspace, inWorkspace } from '../src/workspaces.ts';
import { createForm, saveDraft } from '../src/forms.ts';
import { formVersion } from '../src/publication-schema.ts';
import {
  getPublication,
  publishForm,
  unpublishForm,
} from '../src/publication.ts';
import { formFixture } from '../../contracts/test/form-fixture.ts';
async function fixture(
  run: (
    tx: Transaction,
    actor: string,
    workspaceId: string,
    formId: string,
  ) => Promise<void>,
) {
  if (!process.env.DATABASE_URL)
    throw new Error('Runtime database configuration is required');
  const { db, close } = await openDatabase(process.env.DATABASE_URL);
  const rollback = new Error('Rollback publication fixtures');
  try {
    await expect(
      db.transaction(async (tx) => {
        const actor = crypto.randomUUID(),
          formId = crypto.randomUUID();
        await tx.insert(user).values({
          id: actor,
          name: 'Publication QA',
          email: `${actor}@example.invalid`,
          emailVerified: true,
        });
        const workspace = await createWorkspace(tx, actor, {
          id: crypto.randomUUID(),
          name: 'Publication QA',
          segment: 'agency',
        });
        await createForm(tx, actor, workspace.id, {
          id: formId,
          definition: formFixture().definition,
        });
        await run(tx, actor, workspace.id, formId);
        throw rollback;
      }),
    ).rejects.toBe(rollback);
  } finally {
    await close();
  }
}
it(
  'publishes immutable snapshots and deduplicates the same operation',
  async () =>
    fixture(async (tx, actor, workspaceId, formId) => {
      expect(await getPublication(tx, actor, workspaceId, formId)).toBeNull();
      const first = { versionId: crypto.randomUUID(), expectedRevision: 1 };
      const receipt = await publishForm(tx, actor, workspaceId, formId, first);
      expect(receipt).toMatchObject({
        versionId: first.versionId,
        number: 1,
        sourceRevision: 1,
        publication: { active: true, versionId: first.versionId },
      });
      expect(await publishForm(tx, actor, workspaceId, formId, first)).toEqual(
        receipt,
      );
      const definition = {
        ...formFixture().definition,
        title: 'Changed after publication',
      };
      await saveDraft(tx, actor, workspaceId, formId, {
        operationId: crypto.randomUUID(),
        expectedRevision: 1,
        definition,
      });
      const original = await inWorkspace(
        tx,
        actor,
        workspaceId,
        'responses.read',
        async (scoped) =>
          scoped
            .select()
            .from(formVersion)
            .where(eq(formVersion.id, first.versionId)),
      );
      expect(original[0].definition.title).not.toBe(definition.title);
    }),
  30000,
);

it(
  'advances version numbers across repeated publications without changing the share identity',
  async () =>
    fixture(async (tx, actor, workspaceId, formId) => {
      let publicId: string | undefined;
      let versionId = '';
      for (let number = 1; number <= 3; number++) {
        versionId = crypto.randomUUID();
        const receipt = await publishForm(tx, actor, workspaceId, formId, {
          versionId,
          expectedRevision: 1,
        });
        publicId ||= receipt.publication?.publicId;
        expect(receipt).toMatchObject({
          number,
          publication: { publicId, versionId, active: true },
        });
      }
      expect(
        await getPublication(tx, actor, workspaceId, formId),
      ).toMatchObject({ number: 3, versionId, publicId });
    }),
  30000,
);
it(
  'keeps a later live version when an older publication is retried',
  async () =>
    fixture(async (tx, actor, workspaceId, formId) => {
      const first = { versionId: crypto.randomUUID(), expectedRevision: 1 };
      const receipt = await publishForm(tx, actor, workspaceId, formId, first);
      await saveDraft(tx, actor, workspaceId, formId, {
        operationId: crypto.randomUUID(),
        expectedRevision: 1,
        definition: formFixture().definition,
      });
      const second = { versionId: crypto.randomUUID(), expectedRevision: 2 };
      expect(
        await publishForm(tx, actor, workspaceId, formId, second),
      ).toMatchObject({
        number: 2,
        sourceRevision: 2,
        publication: {
          publicId: receipt.publication?.publicId,
          versionId: second.versionId,
        },
      });
      expect(
        await publishForm(tx, actor, workspaceId, formId, first),
      ).toMatchObject({
        versionId: first.versionId,
        publication: { versionId: second.versionId },
      });
    }),
  30000,
);

it(
  'deduplicates stopping and never reactivates a stopped publication on retry',
  async () =>
    fixture(async (tx, actor, workspaceId, formId) => {
      const input = { versionId: crypto.randomUUID(), expectedRevision: 1 };
      await publishForm(tx, actor, workspaceId, formId, input);
      for (let attempt = 0; attempt < 2; attempt++)
        expect(
          await unpublishForm(tx, actor, workspaceId, formId, {
            expectedVersionId: input.versionId,
          }),
        ).toMatchObject({ active: false });
      expect(
        await publishForm(tx, actor, workspaceId, formId, input),
      ).toMatchObject({
        publication: { active: false },
      });
    }),
  30000,
);

it(
  'reactivates only with a new publication and rejects stale stop or changed operation reuse',
  async () =>
    fixture(async (tx, actor, workspaceId, formId) => {
      const first = { versionId: crypto.randomUUID(), expectedRevision: 1 };
      const receipt = await publishForm(tx, actor, workspaceId, formId, first);
      await unpublishForm(tx, actor, workspaceId, formId, {
        expectedVersionId: first.versionId,
      });
      const second = { ...first, versionId: crypto.randomUUID() };
      expect(
        await publishForm(tx, actor, workspaceId, formId, second),
      ).toMatchObject({
        number: 2,
        publication: { active: true, publicId: receipt.publication?.publicId },
      });
      await expect(
        unpublishForm(tx, actor, workspaceId, formId, {
          expectedVersionId: first.versionId,
        }),
      ).rejects.toThrow('PUBLICATION_CONFLICT');
      await expect(
        publishForm(tx, actor, workspaceId, formId, {
          ...first,
          expectedRevision: 2,
        }),
      ).rejects.toThrow('OPERATION_CONFLICT');
      expect(
        await getPublication(tx, actor, workspaceId, formId),
      ).toMatchObject({
        versionId: second.versionId,
        active: true,
      });
    }),
  30000,
);

it(
  'rejects invalid and stale drafts without partial publication snapshots',
  async () =>
    fixture(async (tx, actor, workspaceId, formId) => {
      await saveDraft(tx, actor, workspaceId, formId, {
        operationId: crypto.randomUUID(),
        expectedRevision: 1,
        definition: { ...formFixture().definition, title: '' },
      });
      const input = { versionId: crypto.randomUUID(), expectedRevision: 2 };
      await expect(
        publishForm(tx, actor, workspaceId, formId, input),
      ).rejects.toThrow('INVALID_PUBLICATION');
      expect(await getPublication(tx, actor, workspaceId, formId)).toBeNull();
      await saveDraft(tx, actor, workspaceId, formId, {
        operationId: crypto.randomUUID(),
        expectedRevision: 2,
        definition: formFixture().definition,
      });
      await expect(
        publishForm(tx, actor, workspaceId, formId, input),
      ).rejects.toThrow('DRAFT_CONFLICT');
      expect(
        await inWorkspace(
          tx,
          actor,
          workspaceId,
          'responses.read',
          async (scoped) => scoped.select().from(formVersion),
        ),
      ).toHaveLength(0);
    }),
  30000,
);

it(
  'denies missing forms and viewer publication writes',
  async () =>
    fixture(async (tx, actor, workspaceId, formId) => {
      const input = { versionId: crypto.randomUUID(), expectedRevision: 1 };
      await expect(
        publishForm(tx, actor, workspaceId, crypto.randomUUID(), input),
      ).rejects.toThrow('FORM_NOT_FOUND');
      const viewer = crypto.randomUUID();
      await tx.insert(user).values({
        id: viewer,
        name: 'Publication viewer QA',
        email: `${viewer}@example.invalid`,
        emailVerified: true,
      });
      await inWorkspace(tx, actor, workspaceId, 'forms.write', async (scoped) =>
        scoped
          .insert(membership)
          .values({ workspaceId, userId: viewer, role: 'viewer' }),
      );
      await expect(
        publishForm(tx, viewer, workspaceId, formId, input),
      ).rejects.toThrow('FORBIDDEN');
      await expect(
        unpublishForm(tx, viewer, workspaceId, formId, {
          expectedVersionId: input.versionId,
        }),
      ).rejects.toThrow('FORBIDDEN');
      expect(
        await inWorkspace(
          tx,
          actor,
          workspaceId,
          'responses.read',
          async (scoped) => scoped.select().from(formVersion),
        ),
      ).toHaveLength(0);
    }),
  30000,
);

it(
  'binds publication operation identities to their original actor and form',
  async () =>
    fixture(async (tx, actor, workspaceId, formId) => {
      const input = { versionId: crypto.randomUUID(), expectedRevision: 1 };
      await publishForm(tx, actor, workspaceId, formId, input);
      const editor = crypto.randomUUID();
      await tx.insert(user).values({
        id: editor,
        name: 'Publication editor QA',
        email: `${editor}@example.invalid`,
        emailVerified: true,
      });
      await inWorkspace(
        tx,
        actor,
        workspaceId,
        'members.manage',
        async (scoped) =>
          scoped
            .insert(membership)
            .values({ workspaceId, userId: editor, role: 'editor' }),
      );
      await expect(
        publishForm(tx, editor, workspaceId, formId, input),
      ).rejects.toThrow('OPERATION_CONFLICT');
      const otherId = crypto.randomUUID();
      await createForm(tx, actor, workspaceId, {
        id: otherId,
        definition: formFixture().definition,
      });
      await expect(
        publishForm(tx, actor, workspaceId, otherId, input),
      ).rejects.toThrow('OPERATION_CONFLICT');
      expect(await getPublication(tx, actor, workspaceId, otherId)).toBeNull();
    }),
  30000,
);
