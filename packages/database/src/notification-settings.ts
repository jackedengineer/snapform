import { and, desc, eq, sql } from 'drizzle-orm';
import {
  emailSettingsInputSchema,
  emailRetryInputSchema,
} from '@snapform/contracts/notifications';
import type {
  EmailSettingsInput,
  EmailRetryInput,
} from '@snapform/contracts/notifications';
import type { Database, Transaction } from './client.ts';
import { inWorkspace } from './workspaces.ts';
import { formCursorSchema } from '@snapform/contracts/draft';
import { formDraft } from './form-schema.ts';
import {
  formEmailSettings,
  responseEmailDelivery,
} from './notification-schema.ts';
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
async function readSettings(
  tx: Transaction,
  workspaceId: string,
  formId: string,
) {
  const [settings] = await tx
    .select({
      enabled: sql<boolean>`coalesce(${formEmailSettings.enabled},false)`,
      revision: sql<number>`coalesce(${formEmailSettings.revision},0)`,
    })
    .from(formDraft)
    .leftJoin(formEmailSettings, key(workspaceId, formId))
    .where(
      and(eq(formDraft.workspaceId, workspaceId), eq(formDraft.formId, formId)),
    );
  if (!settings) throw Error('FORM_NOT_FOUND');
  return settings;
}
export async function getEmailSettings(
  db: Database | Transaction,
  actor: string,
  workspaceId: string,
  formId: string,
) {
  workspaceId = identity.parse(workspaceId);
  formId = identity.parse(formId);
  return inWorkspace(db, actor, workspaceId, 'responses.read', (tx) =>
    readSettings(tx, workspaceId, formId),
  );
}
export async function getEmailOverview(
  db: Database | Transaction,
  actor: string,
  workspaceId: string,
  formId: string,
) {
  workspaceId = identity.parse(workspaceId);
  formId = identity.parse(formId);
  return inWorkspace(db, actor, workspaceId, 'responses.read', async (tx) => {
    const settings = await readSettings(tx, workspaceId, formId);
    const deliveries = await tx
      .select({
        id: responseEmailDelivery.id,
        responseId: responseEmailDelivery.sessionId,
        status: responseEmailDelivery.status,
        attempts: responseEmailDelivery.attempts,
        retryable: sql<boolean>`public.can_retry_owner_email(${responseEmailDelivery.id})`,
        reason: responseEmailDelivery.reason,
        createdAt: responseEmailDelivery.createdAt,
      })
      .from(responseEmailDelivery)
      .where(
        and(
          eq(responseEmailDelivery.workspaceId, workspaceId),
          eq(responseEmailDelivery.formId, formId),
        ),
      )
      .orderBy(
        desc(responseEmailDelivery.createdAt),
        desc(responseEmailDelivery.id),
      )
      .limit(20);
    return {
      settings,
      deliveries: deliveries.map((row) => ({
        ...row,
        createdAt: row.createdAt.toISOString(),
      })),
    };
  });
}
export async function retryOwnerEmail(
  db: Database | Transaction,
  actor: string,
  workspaceId: string,
  formId: string,
  raw: EmailRetryInput,
) {
  workspaceId = identity.parse(workspaceId);
  formId = identity.parse(formId);
  const input = emailRetryInputSchema.parse(raw);
  return inWorkspace(
    db,
    actor,
    workspaceId,
    'integrations.manage',
    async (tx) => {
      const { rows } = await tx.execute<{ queued: boolean }>(
        sql`select public.retry_owner_email(${workspaceId}::uuid,${formId}::uuid,${input.deliveryId}::uuid,${input.expectedAttempts}::integer) as queued`,
      );
      if (rows[0]?.queued !== true) throw Error('EMAIL_RETRY_CONFLICT');
    },
  );
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
