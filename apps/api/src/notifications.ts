import type { Request, Response } from 'express';
import type { Database } from '@snapform/database';
import {
  getEmailOverview,
  configureEmailNotifications,
} from '@snapform/database/notification-settings';
import {
  emailSettingsInputSchema,
  emailSettingsSchema,
  emailOverviewSchema,
} from '@snapform/contracts/notifications';
import { responseEventMessageSchema } from '@snapform/contracts/response-event';
const identity = responseEventMessageSchema.shape.eventId;
type NotificationRoute = { workspaceId: string; formId: string };
export function matchNotificationRoute(path: string): NotificationRoute | null {
  const match = path.match(
    /^\/api\/v1\/workspaces\/([A-Fa-f0-9-]{36})\/forms\/([A-Fa-f0-9-]{36})\/notifications$/,
  );
  if (!match) return null;
  const workspace = identity.safeParse(match[1]),
    form = identity.safeParse(match[2]);
  return workspace.success && form.success
    ? { workspaceId: workspace.data, formId: form.data }
    : null;
}
export async function handleNotificationRequest(
  req: Request,
  res: Response,
  db: Database,
  actor: string,
  route: NotificationRoute,
) {
  if (!['GET', 'PUT'].includes(req.method)) {
    res.setHeader('Allow', 'GET, PUT');
    res.status(405).json({ error: { code: 'METHOD_NOT_ALLOWED' } });
    return;
  }
  if (Object.keys(req.query).length) {
    res.status(422).json({ error: { code: 'INVALID_NOTIFICATION_SETTINGS' } });
    return;
  }
  try {
    if (req.method === 'GET') {
      res.json(
        emailOverviewSchema.parse(
          await getEmailOverview(db, actor, route.workspaceId, route.formId),
        ),
      );
      return;
    }
    const input = emailSettingsInputSchema.safeParse(req.body);
    if (!input.success) {
      res
        .status(422)
        .json({ error: { code: 'INVALID_NOTIFICATION_SETTINGS' } });
      return;
    }
    res.json(
      emailSettingsSchema.parse(
        await configureEmailNotifications(
          db,
          actor,
          route.workspaceId,
          route.formId,
          input.data,
        ),
      ),
    );
  } catch (error) {
    const code = error instanceof Error ? error.message : '';
    const status =
      code === 'FORBIDDEN'
        ? 403
        : code === 'EMAIL_SETTINGS_CONFLICT'
          ? 409
          : ['WORKSPACE_NOT_FOUND', 'FORM_NOT_FOUND'].includes(code)
            ? 404
            : undefined;
    if (!status) throw error;
    res
      .status(status)
      .json({ error: { code: status === 404 ? 'NOT_FOUND' : code } });
  }
}
