import { and, desc, eq, sql } from 'drizzle-orm';
import { webhookSendInputSchema } from '@snapform/contracts/webhook-deliveries';
import type { Database, Transaction } from './client.ts';
import { inWorkspace } from './workspaces.ts';
import { form } from './form-schema.ts';
import { webhookDelivery } from './webhook-delivery-schema.ts';
const identity = webhookSendInputSchema.shape.configurationId;
export async function requestWebhookDelivery(
  db: Database | Transaction,
  actor: string,
  workspaceId: string,
  formId: string,
  raw: unknown,
) {
  workspaceId = identity.parse(workspaceId);
  formId = identity.parse(formId);
  const input = webhookSendInputSchema.parse(raw);
  return inWorkspace(
    db,
    actor,
    workspaceId,
    'integrations.manage',
    async (tx) => {
      const { rows } = await tx.execute<{ queued: boolean }>(
        sql`select public.queue_webhook(${workspaceId}::uuid,${formId}::uuid,${input.deliveryId}::uuid,${input.configurationId}::uuid,${input.expectedRevision}::integer,${input.expectedAttempts}::integer,${input.acknowledgeDuplicateRisk}::boolean) as queued`,
      );
      if (rows[0]?.queued !== true) throw Error('WEBHOOK_DELIVERY_CONFLICT');
      return { id: input.deliveryId };
    },
  );
}
export async function listWebhookDeliveries(
  db: Database | Transaction,
  actor: string,
  workspaceId: string,
  formId: string,
) {
  workspaceId = identity.parse(workspaceId);
  formId = identity.parse(formId);
  return inWorkspace(
    db,
    actor,
    workspaceId,
    'integrations.manage',
    async (tx) => {
      const [exists] = await tx
        .select({ id: form.id })
        .from(form)
        .where(and(eq(form.workspaceId, workspaceId), eq(form.id, formId)));
      if (!exists) throw Error('FORM_NOT_FOUND');
      const rows = await tx
        .select({
          id: webhookDelivery.id,
          configurationId: webhookDelivery.configurationId,
          versionId: webhookDelivery.versionId,
          kind: webhookDelivery.kind,
          status: webhookDelivery.status,
          reason: webhookDelivery.reason,
          attempts: webhookDelivery.attempts,
          httpStatus: webhookDelivery.httpStatus,
          createdAt: webhookDelivery.createdAt,
          updatedAt: webhookDelivery.updatedAt,
          availableAt: webhookDelivery.availableAt,
          acknowledgedAt: webhookDelivery.acknowledgedAt,
        })
        .from(webhookDelivery)
        .where(
          and(
            eq(webhookDelivery.workspaceId, workspaceId),
            eq(webhookDelivery.formId, formId),
          ),
        )
        .orderBy(desc(webhookDelivery.createdAt), desc(webhookDelivery.id))
        .limit(20);
      return {
        deliveries: rows.map((row) => ({
          ...row,
          createdAt: row.createdAt.toISOString(),
          updatedAt: row.updatedAt.toISOString(),
          availableAt: row.availableAt.toISOString(),
          acknowledgedAt: row.acknowledgedAt?.toISOString() ?? null,
        })),
      };
    },
  );
}
