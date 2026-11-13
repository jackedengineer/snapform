import type { Request, Response } from 'express';
import type { Database } from '@snapform/database';
import { getBilling } from '@snapform/database/billing';
import { billingSummary } from '@snapform/contracts/billing-server';
import { createWorkspaceSchema } from '@snapform/contracts/workspace';
import { requestScope } from './request-context.ts';
import { razorpayConfig } from './razorpay.ts';

const pattern = /^\/api\/v1\/workspaces\/([A-Fa-f0-9-]{36})\/billing$/;
export function matchBillingRoute(path: string) {
  const match = path.match(pattern);
  if (!match) return null;
  const workspaceId = createWorkspaceSchema.shape.id.safeParse(match[1]);
  return workspaceId.success ? { workspaceId: workspaceId.data } : null;
}
export const billingFailures = new Map([
  ['WORKSPACE_NOT_FOUND', 404],
  ['FORBIDDEN', 403],
]);
export async function handleBillingRequest(
  req: Request,
  res: Response,
  db: Database,
  actor: string,
  route: NonNullable<ReturnType<typeof matchBillingRoute>>,
) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    res.status(405).json({ error: { code: 'METHOD_NOT_ALLOWED' } });
    return;
  }
  const environment = requestScope.getStore()?.environment;
  if (!environment) throw new Error('Request context is required.');
  try {
    const record = await getBilling(db, actor, route.workspaceId);
    res.json({
      billing: billingSummary(record, razorpayConfig(environment) !== null),
    });
  } catch (error) {
    const status =
      error instanceof Error ? billingFailures.get(error.message) : undefined;
    if (!status || !(error instanceof Error)) throw error;
    res.status(status).json({ error: { code: error.message } });
  }
}
