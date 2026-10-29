import { and, desc, eq, sql } from 'drizzle-orm';
import { compileDefinition } from '@snapform/contracts/compile';
import {
  publishFormSchema,
  unpublishFormSchema,
} from '@snapform/contracts/publication';
import type {
  PublishForm,
  UnpublishForm,
} from '@snapform/contracts/publication';
import type { Database, Transaction } from './client.ts';
import { inWorkspace } from './workspaces.ts';
import { formDraft } from './form-schema.ts';
import { formVersion, formPublication } from './publication-schema.ts';
type Connection = Database | Transaction;
const identity = publishFormSchema.shape.versionId;
async function readPublication(
  tx: Transaction,
  workspaceId: string,
  formId: string,
) {
  const [publication] = await tx
    .select({
      publicId: formPublication.publicId,
      versionId: formPublication.versionId,
      number: formVersion.number,
      sourceRevision: formVersion.sourceRevision,
      active: formPublication.active,
      updatedAt: formPublication.updatedAt,
    })
    .from(formPublication)
    .innerJoin(
      formVersion,
      and(
        eq(formVersion.workspaceId, formPublication.workspaceId),
        eq(formVersion.formId, formPublication.formId),
        eq(formVersion.id, formPublication.versionId),
      ),
    )
    .where(
      and(
        eq(formPublication.workspaceId, workspaceId),
        eq(formPublication.formId, formId),
      ),
    );
  return publication || null;
}
export async function getPublication(
  db: Connection,
  actor: string,
  workspaceId: string,
  formId: string,
) {
  workspaceId = identity.parse(workspaceId);
  formId = identity.parse(formId);
  return inWorkspace(db, actor, workspaceId, 'responses.read', async (tx) => {
    const [existing] = await tx
      .select({ id: formDraft.formId })
      .from(formDraft)
      .where(
        and(
          eq(formDraft.workspaceId, workspaceId),
          eq(formDraft.formId, formId),
        ),
      );
    if (!existing) throw new Error('FORM_NOT_FOUND');
    return readPublication(tx, workspaceId, formId);
  });
}
export async function publishForm(
  db: Connection,
  actor: string,
  workspaceId: string,
  formId: string,
  raw: PublishForm,
) {
  const input = publishFormSchema.parse(raw);
  workspaceId = identity.parse(workspaceId);
  formId = identity.parse(formId);
  return inWorkspace(db, actor, workspaceId, 'forms.write', async (tx) => {
    // Use the same row lock as saveDraft, so snapshots and draft edits serialize.
    const [draft] = await tx
      .select({
        revision: formDraft.revision,
        definition: formDraft.definition,
      })
      .from(formDraft)
      .where(
        and(
          eq(formDraft.workspaceId, workspaceId),
          eq(formDraft.formId, formId),
        ),
      )
      .for('update');
    if (!draft) throw new Error('FORM_NOT_FOUND');
    const [existing] = await tx
      .select()
      .from(formVersion)
      .where(
        and(
          eq(formVersion.workspaceId, workspaceId),
          eq(formVersion.formId, formId),
          eq(formVersion.id, input.versionId),
        ),
      );
    if (existing) {
      if (
        existing.createdBy !== actor ||
        existing.sourceRevision !== input.expectedRevision
      )
        throw new Error('OPERATION_CONFLICT');
      // A retry is a receipt read, never a new activation or pointer update.
      return {
        versionId: existing.id,
        number: existing.number,
        sourceRevision: existing.sourceRevision,
        publication: await readPublication(tx, workspaceId, formId),
      };
    }
    if (draft.revision !== input.expectedRevision)
      throw new Error('DRAFT_CONFLICT');
    const compiled = compileDefinition(draft.definition);
    if (!compiled.ok) throw new Error('INVALID_PUBLICATION');
    const [last] = await tx
      .select({ number: formVersion.number })
      .from(formVersion)
      .where(
        and(
          eq(formVersion.workspaceId, workspaceId),
          eq(formVersion.formId, formId),
        ),
      )
      .orderBy(desc(formVersion.number))
      .limit(1);
    const number = (last?.number || 0) + 1;
    if (number > 2147483647) throw new Error('PUBLICATION_LIMIT');
    const inserted = await tx
      .insert(formVersion)
      .values({
        id: input.versionId,
        workspaceId,
        formId,
        number,
        sourceRevision: draft.revision,
        definition: compiled.definition,
        createdBy: actor,
      })
      .onConflictDoNothing()
      .returning({ id: formVersion.id });
    if (!inserted.length) throw new Error('OPERATION_CONFLICT');
    await tx
      .insert(formPublication)
      .values({
        workspaceId,
        formId,
        publicId: crypto.randomUUID(),
        versionId: input.versionId,
        active: true,
        updatedBy: actor,
      })
      .onConflictDoUpdate({
        target: [formPublication.workspaceId, formPublication.formId],
        set: {
          versionId: input.versionId,
          active: true,
          updatedBy: actor,
          updatedAt: sql`now()`,
        },
      });
    return {
      versionId: input.versionId,
      number,
      sourceRevision: draft.revision,
      publication: await readPublication(tx, workspaceId, formId),
    };
  });
}
export async function unpublishForm(
  db: Connection,
  actor: string,
  workspaceId: string,
  formId: string,
  raw: UnpublishForm,
) {
  const input = unpublishFormSchema.parse(raw);
  workspaceId = identity.parse(workspaceId);
  formId = identity.parse(formId);
  return inWorkspace(db, actor, workspaceId, 'forms.write', async (tx) => {
    const [draft] = await tx
      .select({ id: formDraft.formId })
      .from(formDraft)
      .where(
        and(
          eq(formDraft.workspaceId, workspaceId),
          eq(formDraft.formId, formId),
        ),
      )
      .for('update');
    if (!draft) throw new Error('FORM_NOT_FOUND');
    const current = await readPublication(tx, workspaceId, formId);
    if (!current) throw new Error('PUBLICATION_NOT_FOUND');
    if (current.versionId !== input.expectedVersionId)
      throw new Error('PUBLICATION_CONFLICT');
    if (current.active) {
      await tx
        .update(formPublication)
        .set({ active: false, updatedBy: actor, updatedAt: sql`now()` })
        .where(
          and(
            eq(formPublication.workspaceId, workspaceId),
            eq(formPublication.formId, formId),
          ),
        );
    }
    return readPublication(tx, workspaceId, formId);
  });
}
