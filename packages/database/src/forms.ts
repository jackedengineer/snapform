import { and, desc, eq, sql } from 'drizzle-orm';
import {
  createFormSchema,
  saveDraftSchema,
  formCursorSchema,
} from '@snapform/contracts/draft';
import type {
  CreateForm,
  SaveDraft,
  FormCursor,
} from '@snapform/contracts/draft';
import type { Database, Transaction } from './client.ts';
import { inWorkspace } from './workspaces.ts';
import { workspace } from './workspace-schema.ts';
import { form, formDraft, draftOperation } from './form-schema.ts';
type Connection = Database | Transaction;
const identity = createFormSchema.shape.id;
const projection = {
  id: formDraft.formId,
  workspaceId: formDraft.workspaceId,
  revision: formDraft.revision,
  definition: formDraft.definition,
  updatedAt: formDraft.updatedAt,
};
const draftKey = (workspaceId: string, id: string) =>
  and(eq(formDraft.workspaceId, workspaceId), eq(formDraft.formId, id));
const operationKey = (workspaceId: string, formId: string, id: string) =>
  and(
    eq(draftOperation.workspaceId, workspaceId),
    eq(draftOperation.formId, formId),
    eq(draftOperation.id, id),
  );
async function hash(value: unknown) {
  const bytes = await crypto.subtle.digest(
    'SHA-256',
    new TextEncoder().encode(JSON.stringify(value)),
  );
  return Array.from(new Uint8Array(bytes), (byte) =>
    byte.toString(16).padStart(2, '0'),
  ).join('');
}
async function readDraft(tx: Transaction, workspaceId: string, id: string) {
  const [draft] = await tx
    .select(projection)
    .from(formDraft)
    .where(draftKey(workspaceId, id));
  if (!draft) throw new Error('FORM_NOT_FOUND');
  return draft;
}
export async function getForm(
  db: Connection,
  actor: string,
  workspaceId: string,
  id: string,
) {
  workspaceId = identity.parse(workspaceId);
  id = identity.parse(id);
  return inWorkspace(
    db,
    actor,
    workspaceId,
    'responses.read',
    async (tx, role) => ({ ...(await readDraft(tx, workspaceId, id)), role }),
  );
}
export async function createForm(
  db: Connection,
  actor: string,
  workspaceId: string,
  raw: CreateForm,
) {
  const input = createFormSchema.parse(raw);
  workspaceId = identity.parse(workspaceId);
  const payloadHash = await hash(input.definition);
  return inWorkspace(
    db,
    actor,
    workspaceId,
    'forms.write',
    async (tx, role) => {
      const inserted = await tx
        .insert(form)
        .values({ id: input.id, workspaceId, createdBy: actor })
        .onConflictDoNothing();
      if (inserted.rowCount === 0) {
        const [receipt] = await tx
          .select()
          .from(draftOperation)
          .where(operationKey(workspaceId, input.id, input.id));
        if (
          !receipt ||
          receipt.actorId !== actor ||
          receipt.payloadHash !== payloadHash ||
          receipt.baseRevision !== 0
        )
          throw new Error('FORM_CONFLICT');
      } else {
        await tx.insert(formDraft).values({
          workspaceId,
          formId: input.id,
          revision: 1,
          definition: input.definition,
          updatedBy: actor,
        });
        await tx.insert(draftOperation).values({
          workspaceId,
          formId: input.id,
          id: input.id,
          actorId: actor,
          baseRevision: 0,
          resultRevision: 1,
          payloadHash,
        });
      }
      return { ...(await readDraft(tx, workspaceId, input.id)), role };
    },
  );
}
export async function saveDraft(
  db: Connection,
  actor: string,
  workspaceId: string,
  id: string,
  raw: SaveDraft,
) {
  const input = saveDraftSchema.parse(raw);
  workspaceId = identity.parse(workspaceId);
  id = identity.parse(id);
  const payloadHash = await hash({
    expectedRevision: input.expectedRevision,
    definition: input.definition,
  });
  return inWorkspace(db, actor, workspaceId, 'forms.write', async (tx) => {
    // Serialize every operation for this draft before looking up a retry receipt.
    const [current] = await tx
      .select(projection)
      .from(formDraft)
      .where(draftKey(workspaceId, id))
      .for('update');
    if (!current) throw new Error('FORM_NOT_FOUND');
    const [receipt] = await tx
      .select()
      .from(draftOperation)
      .where(operationKey(workspaceId, id, input.operationId));
    if (receipt) {
      if (
        receipt.actorId !== actor ||
        receipt.baseRevision !== input.expectedRevision ||
        receipt.payloadHash !== payloadHash
      )
        throw new Error('OPERATION_CONFLICT');
      return {
        id,
        operationId: input.operationId,
        revision: receipt.resultRevision,
        currentRevision: current.revision,
      };
    }
    if (current.revision !== input.expectedRevision)
      throw new Error('DRAFT_CONFLICT');
    const revision = current.revision + 1;
    const updated = await tx
      .update(formDraft)
      .set({
        revision,
        definition: input.definition,
        updatedBy: actor,
        updatedAt: sql`now()`,
      })
      .where(
        and(
          draftKey(workspaceId, id),
          eq(formDraft.revision, input.expectedRevision),
        ),
      )
      .returning({ id: formDraft.formId });
    if (updated.length !== 1) throw new Error('DRAFT_CONFLICT');
    await tx.insert(draftOperation).values({
      workspaceId,
      formId: id,
      id: input.operationId,
      actorId: actor,
      baseRevision: input.expectedRevision,
      resultRevision: revision,
      payloadHash,
    });
    return {
      id,
      operationId: input.operationId,
      revision,
      currentRevision: revision,
    };
  });
}
export async function listForms(
  db: Connection,
  actor: string,
  workspaceId: string,
  rawCursor?: FormCursor,
) {
  workspaceId = identity.parse(workspaceId);
  const cursor =
    rawCursor === undefined ? undefined : formCursorSchema.parse(rawCursor);
  return inWorkspace(
    db,
    actor,
    workspaceId,
    'responses.read',
    async (tx, role) => {
      const [home] = await tx
        .select({
          id: workspace.id,
          name: workspace.name,
          segment: workspace.segment,
        })
        .from(workspace)
        .where(eq(workspace.id, workspaceId));
      if (!home) throw new Error('WORKSPACE_NOT_FOUND');
      const rows = await tx
        .select({
          id: form.id,
          title: sql<string>`${formDraft.definition}->>'title'`,
          revision: formDraft.revision,
          updatedAt: formDraft.updatedAt,
          // Preserve PostgreSQL microseconds; a JS Date would lose tied-page cursor precision.
          cursorTime: sql<string>`to_char(${form.createdAt} at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"')`,
        })
        .from(form)
        .innerJoin(
          formDraft,
          and(
            eq(form.workspaceId, formDraft.workspaceId),
            eq(form.id, formDraft.formId),
          ),
        )
        .where(
          and(
            eq(form.workspaceId, workspaceId),
            cursor
              ? sql`(${form.createdAt}, ${form.id}) < (${cursor.createdAt}::timestamptz, ${cursor.id}::uuid)`
              : undefined,
          ),
        )
        .orderBy(desc(form.createdAt), desc(form.id))
        .limit(21);
      const page = rows.slice(0, 20),
        last = page.at(-1);
      return {
        workspace: { ...home, role },
        forms: page.map((row) => ({
          id: row.id,
          title: row.title,
          revision: row.revision,
          updatedAt: row.updatedAt,
        })),
        nextCursor:
          rows.length > 20 && last
            ? { createdAt: last.cursorTime, id: last.id }
            : null,
      };
    },
  );
}
