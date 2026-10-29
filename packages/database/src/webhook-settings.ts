import { and, eq, sql } from 'drizzle-orm';
import {
  webhookConfigurationInputSchema,
  webhookSecretInputSchema,
} from '@snapform/contracts/webhook-settings';
import type { WebhookConfigurationInput } from '@snapform/contracts/webhook-settings';
import {
  createWebhookSecret,
  sealWebhookDestination,
  openWebhookDestination,
} from '@snapform/contracts/webhook-crypto';
import { formCursorSchema } from '@snapform/contracts/draft';
import type { Database, Transaction } from './client.ts';
import { inWorkspace } from './workspaces.ts';
import { formDraft } from './form-schema.ts';
import { formWebhookSettings, webhookConfiguration } from './webhook-schema.ts';
import { webhookToggleInputSchema } from '@snapform/contracts/webhook-deliveries';
const identity = formCursorSchema.shape.id;
export async function configureWebhookDelivery(
  db: Database | Transaction,
  actor: string,
  workspaceId: string,
  formId: string,
  raw: unknown,
  master: string,
) {
  workspaceId = identity.parse(workspaceId);
  formId = identity.parse(formId);
  const input = webhookToggleInputSchema.parse(raw);
  return inWorkspace(
    db,
    actor,
    workspaceId,
    'integrations.manage',
    async (tx) => {
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
      if (!draft) throw Error('FORM_NOT_FOUND');
      const current = await readSettings(tx, workspaceId, formId, master);
      if (
        current.revision !== input.expectedRevision ||
        current.configurationId !== input.configurationId
      )
        throw Error('WEBHOOK_SETTINGS_CONFLICT');
      if (input.enabled && !current.verifiedAt)
        throw Error('WEBHOOK_TEST_REQUIRED');
      const [updated] = await tx
        .update(formWebhookSettings)
        .set({
          enabled: input.enabled,
          revision: current.revision + 1,
          updatedBy: actor,
          updatedAt: sql`now()`,
        })
        .where(
          and(
            eq(formWebhookSettings.workspaceId, workspaceId),
            eq(formWebhookSettings.formId, formId),
            eq(formWebhookSettings.configurationId, input.configurationId),
            eq(formWebhookSettings.revision, input.expectedRevision),
          ),
        )
        .returning({ revision: formWebhookSettings.revision });
      if (!updated) throw Error('WEBHOOK_SETTINGS_CONFLICT');
      return { ...current, enabled: input.enabled, revision: updated.revision };
    },
  );
}
async function readSettings(
  tx: Transaction,
  workspaceId: string,
  formId: string,
  master: string,
) {
  const [row] = await tx
    .select({
      revision: formWebhookSettings.revision,
      enabled: formWebhookSettings.enabled,
      configurationId: webhookConfiguration.id,
      sealed: webhookConfiguration.sealedDestination,
      verifiedAt: webhookConfiguration.verifiedAt,
    })
    .from(formDraft)
    .leftJoin(
      formWebhookSettings,
      and(
        eq(formWebhookSettings.workspaceId, workspaceId),
        eq(formWebhookSettings.formId, formId),
      ),
    )
    .leftJoin(
      webhookConfiguration,
      eq(webhookConfiguration.id, formWebhookSettings.configurationId),
    )
    .where(
      and(eq(formDraft.workspaceId, workspaceId), eq(formDraft.formId, formId)),
    );
  if (!row) throw Error('FORM_NOT_FOUND');
  if (row.configurationId === null)
    return {
      enabled: false,
      revision: 0,
      configurationId: null,
      url: null,
      verifiedAt: null,
    };
  if (row.sealed === null || row.revision === null || row.enabled === null)
    throw Error('WEBHOOK_DESTINATION_UNAVAILABLE');
  const destination = await openWebhookDestination(row.sealed, master, {
    workspaceId,
    formId,
    configurationId: row.configurationId,
  });
  return {
    enabled: row.enabled,
    revision: row.revision,
    configurationId: row.configurationId,
    url: destination.url,
    verifiedAt: row.verifiedAt?.toISOString() ?? null,
  };
}
export async function getWebhookSettings(
  db: Database | Transaction,
  actor: string,
  workspaceId: string,
  formId: string,
  master: string,
) {
  workspaceId = identity.parse(workspaceId);
  formId = identity.parse(formId);
  return inWorkspace(db, actor, workspaceId, 'integrations.manage', (tx) =>
    readSettings(tx, workspaceId, formId, master),
  );
}
export async function saveWebhookConfiguration(
  db: Database | Transaction,
  actor: string,
  workspaceId: string,
  formId: string,
  raw: WebhookConfigurationInput,
  master: string,
) {
  workspaceId = identity.parse(workspaceId);
  formId = identity.parse(formId);
  const input = webhookConfigurationInputSchema.parse(raw);
  return inWorkspace(
    db,
    actor,
    workspaceId,
    'integrations.manage',
    async (tx) => {
      // Serialize first-time creation and subsequent changes on the existing draft.
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
      const current = await readSettings(tx, workspaceId, formId, master);
      if (current.revision !== input.expectedRevision)
        throw Error('WEBHOOK_SETTINGS_CONFLICT');
      const [duplicate] = await tx
        .select({ id: webhookConfiguration.id })
        .from(webhookConfiguration)
        .where(eq(webhookConfiguration.id, input.configurationId));
      if (duplicate) throw Error('WEBHOOK_SETTINGS_CONFLICT');
      const sealedDestination = await sealWebhookDestination(
        { url: input.url, secret: createWebhookSecret() },
        master,
        { workspaceId, formId, configurationId: input.configurationId },
      );
      await tx.insert(webhookConfiguration).values({
        id: input.configurationId,
        workspaceId,
        formId,
        sealedDestination,
        createdBy: actor,
      });
      await tx
        .insert(formWebhookSettings)
        .values({
          workspaceId,
          formId,
          configurationId: input.configurationId,
          updatedBy: actor,
        })
        .onConflictDoUpdate({
          target: [formWebhookSettings.workspaceId, formWebhookSettings.formId],
          set: {
            configurationId: input.configurationId,
            enabled: false,
            revision: current.revision + 1,
            updatedBy: actor,
            updatedAt: sql`now()`,
          },
        });
      return readSettings(tx, workspaceId, formId, master);
    },
  );
}
export async function getWebhookSigningSecret(
  db: Database | Transaction,
  actor: string,
  workspaceId: string,
  formId: string,
  raw: import('@snapform/contracts/webhook-settings').WebhookSecretInput,
  master: string,
) {
  workspaceId = identity.parse(workspaceId);
  formId = identity.parse(formId);
  const input = webhookSecretInputSchema.parse(raw);
  return inWorkspace(
    db,
    actor,
    workspaceId,
    'integrations.manage',
    async (tx) => {
      const [row] = await tx
        .select({ sealed: webhookConfiguration.sealedDestination })
        .from(formWebhookSettings)
        .innerJoin(
          webhookConfiguration,
          eq(webhookConfiguration.id, formWebhookSettings.configurationId),
        )
        .where(
          and(
            eq(formWebhookSettings.workspaceId, workspaceId),
            eq(formWebhookSettings.formId, formId),
            eq(formWebhookSettings.revision, input.expectedRevision),
            eq(formWebhookSettings.configurationId, input.configurationId),
          ),
        );
      if (!row) throw Error('WEBHOOK_SETTINGS_CONFLICT');
      const destination = await openWebhookDestination(row.sealed, master, {
        workspaceId,
        formId,
        configurationId: input.configurationId,
      });
      return { secret: destination.secret };
    },
  );
}
