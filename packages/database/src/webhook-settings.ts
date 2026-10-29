import { and, eq, sql } from 'drizzle-orm';
import { webhookConfigurationInputSchema } from '@snapform/contracts/webhook-settings';
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
const identity = formCursorSchema.shape.id;
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
