import type { Request, Response } from 'express';
import type { Database } from '@snapform/database';
import {
  getBilling,
  markCancellation,
  recordSubscription,
} from '@snapform/database/billing';
import { checkoutInputSchema } from '@snapform/contracts/billing';
import { billingSummary } from '@snapform/contracts/billing-server';
import { createWorkspaceSchema } from '@snapform/contracts/workspace';
import { requestScope } from './request-context.ts';
import {
  cancelSubscription,
  createSubscription,
  razorpayConfig,
} from './razorpay.ts';

const pattern =
  /^\/api\/v1\/workspaces\/([A-Fa-f0-9-]{36})\/billing(?:\/(checkout|cancel))?$/;
export function matchBillingRoute(path: string) {
  const match = path.match(pattern);
  if (!match) return null;
  const workspaceId = createWorkspaceSchema.shape.id.safeParse(match[1]);
  const action =
    match[2] === 'checkout' || match[2] === 'cancel' ? match[2] : 'read';
  return workspaceId.success ? { workspaceId: workspaceId.data, action } : null;
}
/** Public: which currencies checkout offers in the current mode, for /pricing. */
export function billingOptions(_req: Request, res: Response) {
  const environment = requestScope.getStore()?.environment;
  if (!environment) throw new Error('Request context is required.');
  res.json({ currencies: razorpayConfig(environment)?.currencies ?? [] });
}
export const billingFailures = new Map([
  ['WORKSPACE_NOT_FOUND', 404],
  ['FORBIDDEN', 403],
  ['WORKSPACE_DELETION_PENDING', 409],
  ['BILLING_ALREADY_ACTIVE', 409],
  ['BILLING_NOT_ACTIVE', 409],
  ['BILLING_CURRENCY_UNAVAILABLE', 422],
  ['BILLING_PROVIDER_UNAVAILABLE', 502],
  ['BILLING_NOT_CONFIGURED', 503],
]);
export async function handleBillingRequest(
  req: Request,
  res: Response,
  db: Database,
  actor: string,
  route: NonNullable<ReturnType<typeof matchBillingRoute>>,
) {
  const method = route.action === 'read' ? 'GET' : 'POST';
  if (req.method !== method) {
    res.setHeader('Allow', method);
    res.status(405).json({ error: { code: 'METHOD_NOT_ALLOWED' } });
    return;
  }
  const environment = requestScope.getStore()?.environment;
  if (!environment) throw new Error('Request context is required.');
  const config = razorpayConfig(environment),
    { workspaceId } = route;
  try {
    if (route.action === 'read') {
      const record = await getBilling(db, actor, workspaceId);
      res.json({ billing: billingSummary(record, config?.currencies ?? []) });
      return;
    }
    const input =
      route.action === 'checkout'
        ? checkoutInputSchema.safeParse(req.body)
        : null;
    if (input && !input.success) {
      res.status(422).json({ error: { code: 'INVALID_BILLING_REQUEST' } });
      return;
    }
    if (!config) throw Error('BILLING_NOT_CONFIGURED');
    if (input?.success && !config.currencies.includes(input.data.currency))
      throw Error('BILLING_CURRENCY_UNAVAILABLE');
    // Authorize and read before any provider call; no transaction stays open
    // across the Razorpay request.
    const record = await getBilling(db, actor, workspaceId);
    if (record.role !== 'owner') throw Error('FORBIDDEN');
    const live =
      record.status === 'active' &&
      record.plan === 'pro' &&
      record.subscriptionId !== null;
    if (input?.success) {
      if (live && !record.cancelAtPeriodEnd)
        throw Error('BILLING_ALREADY_ACTIVE');
      // Reopen an unpaid checkout for the same price instead of creating another.
      const subscriptionId =
        record.status === 'created' &&
        record.subscriptionId &&
        record.interval === input.data.interval &&
        record.currency === input.data.currency
          ? record.subscriptionId
          : await createSubscription(config, input.data, workspaceId);
      await recordSubscription(
        db,
        actor,
        workspaceId,
        subscriptionId,
        input.data,
      );
      res.json({ checkout: { key: config.keyId, subscriptionId } });
      return;
    }
    if (!live || !record.subscriptionId || record.cancelAtPeriodEnd)
      throw Error('BILLING_NOT_ACTIVE');
    await cancelSubscription(config, record.subscriptionId);
    await markCancellation(db, actor, workspaceId, record.subscriptionId);
    res.json({
      billing: billingSummary(
        await getBilling(db, actor, workspaceId),
        config.currencies,
      ),
    });
  } catch (error) {
    const status =
      error instanceof Error ? billingFailures.get(error.message) : undefined;
    if (!status || !(error instanceof Error)) throw error;
    res.status(status).json({ error: { code: error.message } });
  }
}
