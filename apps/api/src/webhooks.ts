import type { Request, Response } from 'express';
import type { Database } from '@snapform/database';
import {
  getWebhookSettings,
  saveWebhookConfiguration,
  getWebhookSigningSecret,
  configureWebhookDelivery,
} from '@snapform/database/webhook-settings';
import {
  webhookConfigurationInputSchema,
  webhookSettingsSchema,
  webhookSecretInputSchema,
  webhookSecretSchema,
  webhookPreviewInputSchema,
} from '@snapform/contracts/webhook-settings';
import { createWebhookPreview } from '@snapform/database/webhook-preview';
import {
  listWebhookDeliveries,
  requestWebhookDelivery,
} from '@snapform/database/webhook-deliveries';
import {
  webhookHistorySchema,
  webhookPreviewSchema,
  webhookSendInputSchema,
  webhookToggleInputSchema,
} from '@snapform/contracts/webhook-deliveries';
import { requestScope } from './request-context.ts';
import { responseEventMessageSchema } from '@snapform/contracts/response-event';
const identity = responseEventMessageSchema.shape.eventId;
type WebhookRoute = {
  workspaceId: string;
  formId: string;
  operation: 'settings' | 'secret' | 'preview' | 'send' | 'deliveries';
};
export function matchWebhookRoute(path: string): WebhookRoute | null {
  const match = path.match(
    /^\/api\/v1\/workspaces\/([A-Fa-f0-9-]{36})\/forms\/([A-Fa-f0-9-]{36})\/webhook(?:\/(secret|preview|send|deliveries))?$/,
  );
  if (!match) return null;
  const workspace = identity.safeParse(match[1]),
    form = identity.safeParse(match[2]);
  return workspace.success && form.success
    ? {
        workspaceId: workspace.data,
        formId: form.data,
        operation: (match[3] || 'settings') as WebhookRoute['operation'],
      }
    : null;
}
export async function handleWebhookRequest(
  req: Request,
  res: Response,
  db: Database,
  actor: string,
  route: WebhookRoute,
  master: string,
) {
  const methods =
    route.operation === 'settings'
      ? ['GET', 'PUT', 'PATCH']
      : route.operation === 'deliveries'
        ? ['GET']
        : ['POST'];
  if (!methods.includes(req.method)) {
    res.setHeader('Allow', methods.join(', '));
    res.status(405).json({ error: { code: 'METHOD_NOT_ALLOWED' } });
    return;
  }
  if (Object.keys(req.query).length) {
    res.status(422).json({ error: { code: 'INVALID_WEBHOOK_SETTINGS' } });
    return;
  }
  if (!master) {
    res.status(503).json({ error: { code: 'WEBHOOK_UNAVAILABLE' } });
    return;
  }
  try {
    if (route.operation === 'deliveries') {
      res.json(
        webhookHistorySchema.parse(
          await listWebhookDeliveries(
            db,
            actor,
            route.workspaceId,
            route.formId,
          ),
        ),
      );
      return;
    }
    if (route.operation === 'preview') {
      const input = webhookPreviewInputSchema.safeParse(req.body);
      if (!input.success) {
        res.status(422).json({ error: { code: 'INVALID_WEBHOOK_SETTINGS' } });
        return;
      }
      res.json(
        webhookPreviewSchema.parse(
          await createWebhookPreview(
            db,
            actor,
            route.workspaceId,
            route.formId,
            input.data,
            master,
          ),
        ),
      );
      return;
    }
    if (route.operation === 'send') {
      const input = webhookSendInputSchema.safeParse(req.body);
      if (!input.success) {
        res.status(422).json({ error: { code: 'INVALID_WEBHOOK_SETTINGS' } });
        return;
      }
      const receipt = await requestWebhookDelivery(
        db,
        actor,
        route.workspaceId,
        route.formId,
        input.data,
      );
      const scope = requestScope.getStore();
      if (scope)
        scope.context.waitUntil(
          wakeWebhookDelivery(scope.environment.JOBS, receipt.id),
        );
      res.status(202).json(receipt);
      return;
    }
    if (route.operation === 'secret') {
      const input = webhookSecretInputSchema.safeParse(req.body);
      if (!input.success) {
        res.status(422).json({ error: { code: 'INVALID_WEBHOOK_SETTINGS' } });
        return;
      }
      res.json(
        webhookSecretSchema.parse(
          await getWebhookSigningSecret(
            db,
            actor,
            route.workspaceId,
            route.formId,
            input.data,
            master,
          ),
        ),
      );
      return;
    }
    if (req.method === 'PATCH') {
      const input = webhookToggleInputSchema.safeParse(req.body);
      if (!input.success) {
        res.status(422).json({ error: { code: 'INVALID_WEBHOOK_SETTINGS' } });
        return;
      }
      res.json(
        webhookSettingsSchema.parse(
          await configureWebhookDelivery(
            db,
            actor,
            route.workspaceId,
            route.formId,
            input.data,
            master,
          ),
        ),
      );
      return;
    }
    if (req.method === 'GET') {
      res.json(
        webhookSettingsSchema.parse(
          await getWebhookSettings(
            db,
            actor,
            route.workspaceId,
            route.formId,
            master,
          ),
        ),
      );
      return;
    }
    const input = webhookConfigurationInputSchema.safeParse(req.body);
    if (!input.success) {
      res.status(422).json({ error: { code: 'INVALID_WEBHOOK_SETTINGS' } });
      return;
    }
    res.json(
      webhookSettingsSchema.parse(
        await saveWebhookConfiguration(
          db,
          actor,
          route.workspaceId,
          route.formId,
          input.data,
          master,
        ),
      ),
    );
  } catch (error) {
    const code = error instanceof Error ? error.message : '';
    const status =
      code === 'FORBIDDEN'
        ? 403
        : [
              'WEBHOOK_SETTINGS_CONFLICT',
              'WORKSPACE_DELETION_PENDING',
              'WEBHOOK_DELIVERY_CONFLICT',
              'OPERATION_CONFLICT',
              'PUBLICATION_REQUIRED',
              'WEBHOOK_TEST_REQUIRED',
            ].includes(code)
          ? 409
          : ['WORKSPACE_NOT_FOUND', 'FORM_NOT_FOUND'].includes(code)
            ? 404
            : code === 'INVALID_WEBHOOK_TEST'
              ? 422
              : code === 'WEBHOOK_DESTINATION_UNAVAILABLE'
                ? 503
                : undefined;
    if (!status) throw error;
    res.status(status).json({
      error: {
        code:
          status === 404
            ? 'NOT_FOUND'
            : status === 503
              ? 'WEBHOOK_UNAVAILABLE'
              : code,
      },
    });
  }
}
export async function wakeWebhookDelivery(
  service: Pick<Fetcher, 'fetch'>,
  id: string,
) {
  try {
    const response = await service.fetch(
      new Request('https://jobs.internal/dispatch/webhooks', {
        method: 'POST',
        redirect: 'manual',
        signal: AbortSignal.timeout(25000),
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ version: 1, eventId: identity.parse(id) }),
      }),
    );
    await response.body?.cancel();
    if (!response.ok) throw Error('Wake unavailable');
  } catch {
    // The committed pending row remains recoverable by Cron.
    console.error(JSON.stringify({ event: 'webhook_wake_unavailable' }));
  }
}
