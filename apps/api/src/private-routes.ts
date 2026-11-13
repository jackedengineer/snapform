import { matchWebhookRoute, handleWebhookRequest } from './webhooks.ts';
import { matchRetentionRoute, handleRetentionRequest } from './retention.ts';
import { requestScope } from './request-context.ts';
import {
  matchResponseExportRoute,
  handleResponseExport,
} from './response-export.ts';
import { json } from 'express';
import {
  matchNotificationRoute,
  handleNotificationRequest,
} from './notifications.ts';
import { matchResponsesRoute, handleResponsesRequest } from './responses.ts';
import type { Request, Response, RequestHandler } from 'express';
import type { Database } from '@snapform/database';
import { handleWorkspaceRequest, workspacePath } from './workspaces.ts';
import { matchFormsRoute, handleFormsRequest } from './forms.ts';
import {
  matchPublicationRoute,
  handlePublicationRequest,
} from './publication.ts';
import { matchDeletionRoute, handleDeletionRequest } from './deletions.ts';
import { matchBillingRoute, handleBillingRequest } from './billing.ts';
import { matchTeamRoute, handleTeamRequest, isTeamWrite } from './team.ts';
import { makeInviteMailer } from './email.ts';

export function isPrivatePath(path: string) {
  return (
    path === '/api/v1/me' ||
    path === workspacePath ||
    matchFormsRoute(path) !== null ||
    matchPublicationRoute(path) !== null ||
    matchResponsesRoute(path) !== null ||
    matchResponseExportRoute(path) !== null ||
    matchNotificationRoute(path) !== null ||
    matchWebhookRoute(path) !== null ||
    matchDeletionRoute(path) !== null ||
    matchBillingRoute(path) !== null ||
    matchRetentionRoute(path) !== null ||
    matchTeamRoute(path) !== null
  );
}
const workspaceBody = json({ limit: 16384, strict: true, inflate: false });
const formBody = json({ limit: 300000, strict: true, inflate: false });
export const privateBody: RequestHandler = (req, res, next) => {
  const isForm =
    matchFormsRoute(req.path) !== null && ['POST', 'PUT'].includes(req.method);
  const isPublication =
    matchPublicationRoute(req.path) !== null &&
    ['POST', 'DELETE'].includes(req.method);
  const isNotification =
    matchNotificationRoute(req.path) !== null &&
    ['PUT', 'POST'].includes(req.method);
  const isWebhook =
    matchWebhookRoute(req.path) !== null &&
    ['PUT', 'POST', 'PATCH'].includes(req.method);
  const isDeletion =
    matchDeletionRoute(req.path) !== null && req.method === 'POST';
  const isRetention =
    matchRetentionRoute(req.path) !== null && req.method === 'PUT';
  const isBilling =
    matchBillingRoute(req.path) !== null && req.method === 'POST';
  if (
    !isTeamWrite(req) &&
    !isWebhook &&
    !isForm &&
    !isPublication &&
    !isNotification &&
    !isDeletion &&
    !isRetention &&
    !isBilling &&
    (req.path !== workspacePath || req.method !== 'POST')
  )
    return next();
  if (!req.is('application/json')) {
    res.status(415).json({ error: { code: 'JSON_REQUIRED' } });
    return;
  }
  (isForm ? formBody : workspaceBody)(req, res, next);
};
export async function handlePrivateRequest(
  req: Request,
  res: Response,
  db: Database,
  user: { id: string; name: string; email: string },
) {
  const webhookRoute = matchWebhookRoute(req.path);
  const exportRoute = matchResponseExportRoute(req.path);
  const responseRoute = matchResponsesRoute(req.path);
  const notificationRoute = matchNotificationRoute(req.path);
  const publicationRoute = matchPublicationRoute(req.path);
  const deletionRoute = matchDeletionRoute(req.path);
  const retentionRoute = matchRetentionRoute(req.path);
  const billingRoute = matchBillingRoute(req.path);
  const teamRoute = matchTeamRoute(req.path);
  if (req.path === '/api/v1/me') {
    if (req.method !== 'GET') {
      res.setHeader('Allow', 'GET');
      res.status(405).json({ error: { code: 'METHOD_NOT_ALLOWED' } });
    } else res.json({ user });
  } else if (req.path === workspacePath) {
    await handleWorkspaceRequest(req, res, db, user.id);
  } else if (deletionRoute) {
    await handleDeletionRequest(req, res, db, user.id, deletionRoute);
  } else if (billingRoute) {
    await handleBillingRequest(req, res, db, user.id, billingRoute);
  } else if (retentionRoute) {
    await handleRetentionRequest(req, res, db, user.id, retentionRoute);
  } else if (teamRoute) {
    const scope = requestScope.getStore();
    if (!scope) throw new Error('Request context is required.');
    const settings = scope.environment;
    await handleTeamRequest(req, res, db, user, teamRoute, {
      origin: new URL(settings.BETTER_AUTH_URL).origin,
      allowed: async () =>
        (await settings.INVITE_RATE_LIMIT.limit({ key: user.id })).success,
      send: makeInviteMailer({
        apiKey: settings.RESEND_API_KEY || '',
        from: settings.EMAIL_FROM || '',
        origin: new URL(settings.BETTER_AUTH_URL).origin,
        allowedRecipient: settings.AUTH_ALLOWED_RECIPIENT,
      }),
    });
  } else if (webhookRoute) {
    await handleWebhookRequest(
      req,
      res,
      db,
      user.id,
      webhookRoute,
      requestScope.getStore()?.environment.WEBHOOK_ENCRYPTION_KEY || '',
    );
  } else if (exportRoute) {
    await handleResponseExport(req, res, db, user.id, exportRoute);
  } else if (notificationRoute) {
    await handleNotificationRequest(req, res, db, user.id, notificationRoute);
  } else if (responseRoute) {
    await handleResponsesRequest(req, res, db, user.id, responseRoute);
  } else if (publicationRoute) {
    await handlePublicationRequest(req, res, db, user.id, publicationRoute);
  } else {
    const route = matchFormsRoute(req.path);
    if (route) await handleFormsRequest(req, res, db, user.id, route);
    else res.status(404).json({ error: { code: 'NOT_FOUND' } });
  }
}
