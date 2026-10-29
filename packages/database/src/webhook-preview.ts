import { and, eq } from 'drizzle-orm';
import { webhookPreviewInputSchema } from '@snapform/contracts/webhook-settings';
import { createWebhookTestPayload } from '@snapform/contracts/webhook-test';
import { openWebhookDestination } from '@snapform/contracts/webhook-crypto';
import type { Database, Transaction } from './client.ts';
import { inWorkspace } from './workspaces.ts';
import { formDraft } from './form-schema.ts';
import { formPublication, formVersion } from './publication-schema.ts';
import { formWebhookSettings, webhookConfiguration } from './webhook-schema.ts';
import { webhookDelivery } from './webhook-delivery-schema.ts';

const identity = webhookPreviewInputSchema.shape.configurationId;
export async function createWebhookPreview(
  db: Database | Transaction,
  actor: string,
  workspaceId: string,
  formId: string,
  raw: unknown,
  master: string,
) {
  workspaceId = identity.parse(workspaceId);
  formId = identity.parse(formId);
  const input = webhookPreviewInputSchema.parse(raw);
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
      const [settings] = await tx
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
            eq(formWebhookSettings.configurationId, input.configurationId),
            eq(formWebhookSettings.revision, input.expectedRevision),
          ),
        );
      if (!settings) throw Error('WEBHOOK_SETTINGS_CONFLICT');
      const [version] = await tx
        .select({
          id: formVersion.id,
          number: formVersion.number,
          definition: formVersion.definition,
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
            eq(formPublication.active, true),
          ),
        );
      if (!version) throw Error('PUBLICATION_REQUIRED');
      const destination = await openWebhookDestination(
        settings.sealed,
        master,
        { workspaceId, formId, configurationId: input.configurationId },
      );
      const at = new Date();
      await tx
        .insert(webhookDelivery)
        .values({
          id: input.deliveryId,
          workspaceId,
          formId,
          configurationId: input.configurationId,
          versionId: version.id,
          kind: 'test',
          status: 'preview',
          createdBy: actor,
          createdAt: at,
          payload: createWebhookTestPayload(
            { id: input.deliveryId, formId, createdAt: at.toISOString() },
            version,
          ),
        })
        .onConflictDoNothing();
      const [row] = await tx
        .select({
          id: webhookDelivery.id,
          configurationId: webhookDelivery.configurationId,
          versionId: webhookDelivery.versionId,
          payload: webhookDelivery.payload,
          status: webhookDelivery.status,
          createdAt: webhookDelivery.createdAt,
        })
        .from(webhookDelivery)
        .where(
          and(
            eq(webhookDelivery.id, input.deliveryId),
            eq(webhookDelivery.workspaceId, workspaceId),
            eq(webhookDelivery.formId, formId),
            eq(webhookDelivery.configurationId, input.configurationId),
            eq(webhookDelivery.versionId, version.id),
            eq(webhookDelivery.createdBy, actor),
            eq(webhookDelivery.kind, 'test'),
          ),
        );
      if (!row || row.payload === null) throw Error('OPERATION_CONFLICT');
      return {
        ...row,
        payload: row.payload,
        createdAt: row.createdAt.toISOString(),
        version: version.number,
        url: destination.url,
      };
    },
  );
}
