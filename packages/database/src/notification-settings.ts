import { and, eq, sql } from 'drizzle-orm';
import { emailSettingsInputSchema } from '@snapform/contracts/notifications';
import type { EmailSettingsInput } from '@snapform/contracts/notifications';
import type { Database, Transaction } from './client.ts';
import { inWorkspace } from './workspaces.ts';
import { formCursorSchema } from '@snapform/contracts/draft';
import { formDraft } from './form-schema.ts';
import { formEmailSettings } from './notification-schema.ts';
const identity = formCursorSchema.shape.id;
const projection = {
  enabled: formEmailSettings.enabled,
  revision: formEmailSettings.revision,
};
const key = (workspaceId: string, formId: string) =>
  and(
    eq(formEmailSettings.workspaceId, workspaceId),
    eq(formEmailSettings.formId, formId),
  );
export async function getEmailSettings(
  db: Database | Transaction,
  actor: string,
  workspaceId: string,
  formId: string,
) {
  workspaceId = identity.parse(workspaceId);
  formId = identity.parse(formId);
  return inWorkspace(db, actor, workspaceId, 'responses.read', async (tx) => {
    const [exists] = await tx
      .select({ id: formDraft.formId })
      .from(formDraft)
      .where(
        and(
          eq(formDraft.workspaceId, workspaceId),
          eq(formDraft.formId, formId),
        ),
      );
    if (!exists) throw Error('FORM_NOT_FOUND');
    const [settings] = await tx
      .select(projection)
      .from(formEmailSettings)
      .where(key(workspaceId, formId));
    return settings ?? { enabled: false, revision: 0 };
  });
}
export async function configureEmailNotifications(
  db: Database | Transaction,
  actor: string,
  workspaceId: string,
  formId: string,
  raw: EmailSettingsInput,
) {
  workspaceId = identity.parse(workspaceId);
  formId = identity.parse(formId);
  const input = emailSettingsInputSchema.parse(raw);
  return inWorkspace(
    db,
    actor,
    workspaceId,
    'integrations.manage',
    async (tx) => {
      // The existing writable draft row also serializes first-time settings creation.
      const [exists] = await tx
        .select({ id: formDraft.formId })
        .from(formDraft)
        .where(
          and(
            eq(formDraft.workspaceId, workspaceId),
            eq(formDraft.formId, formId),
          ),
        )
        .for('update');
      if (!exists) throw Error('FORM_NOT_FOUND');
      const [stored] = await tx
        .select(projection)
        .from(formEmailSettings)
        .where(key(workspaceId, formId));
      const current = stored ?? { enabled: false, revision: 0 };
      if (current.enabled === input.enabled) return current;
      if (current.revision !== input.expectedRevision)
        throw Error('EMAIL_SETTINGS_CONFLICT');
      if (!stored) {
        await tx.insert(formEmailSettings).values({
          workspaceId,
          formId,
          enabled: input.enabled,
          revision: 1,
          updatedBy: actor,
        });
        return { enabled: input.enabled, revision: 1 };
      }
      const [updated] = await tx
        .update(formEmailSettings)
        .set({
          enabled: input.enabled,
          revision: current.revision + 1,
          updatedBy: actor,
          updatedAt: sql`now()`,
        })
        .where(
          and(
            key(workspaceId, formId),
            eq(formEmailSettings.revision, current.revision),
          ),
        )
        .returning(projection);
      if (!updated) throw Error('EMAIL_SETTINGS_CONFLICT');
      return updated;
    },
  );
}
