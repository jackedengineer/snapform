import type { Request, Response } from 'express';
import type { Database } from '@snapform/database';
import {
  getWebhookSettings,
  saveWebhookConfiguration,
  getWebhookSigningSecret,
} from '@snapform/database/webhook-settings';
import {
  webhookConfigurationInputSchema,
  webhookSettingsSchema,
  webhookSecretInputSchema,
  webhookSecretSchema,
} from '@snapform/contracts/webhook-settings';
import { responseEventMessageSchema } from '@snapform/contracts/response-event';
const identity = responseEventMessageSchema.shape.eventId;
type WebhookRoute = { workspaceId: string; formId: string; secret: boolean };
export function matchWebhookRoute(path: string): WebhookRoute | null {
  const match = path.match(
    /^\/api\/v1\/workspaces\/([A-Fa-f0-9-]{36})\/forms\/([A-Fa-f0-9-]{36})\/webhook(\/secret)?$/,
  );
  if (!match) return null;
  const workspace = identity.safeParse(match[1]),
    form = identity.safeParse(match[2]);
  return workspace.success && form.success
    ? {
        workspaceId: workspace.data,
        formId: form.data,
        secret: Boolean(match[3]),
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
  if (!(route.secret ? ['POST'] : ['GET', 'PUT']).includes(req.method)) {
    res.setHeader('Allow', route.secret ? 'POST' : 'GET, PUT');
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
    if (route.secret) {
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
        : code === 'WEBHOOK_SETTINGS_CONFLICT'
          ? 409
          : ['WORKSPACE_NOT_FOUND', 'FORM_NOT_FOUND'].includes(code)
            ? 404
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
