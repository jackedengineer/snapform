import { z } from 'zod';
const states = {
  'email.sent': 'accepted',
  'email.delivered': 'delivered',
  'email.bounced': 'bounced',
  'email.complained': 'complained',
  'email.failed': 'failed',
  'email.suppressed': 'suppressed',
} as const;
const payload = z.object({
  type: z.enum([
    'email.sent',
    'email.delivered',
    'email.bounced',
    'email.complained',
    'email.failed',
    'email.suppressed',
  ]),
  data: z.object({
    email_id: z.uuid(),
    to: z.tuple([z.email().max(254)]),
    tags: z.object({ snapform_delivery: z.uuid() }),
  }),
});
export type ProviderEmailReceipt = {
  deliveryId: string;
  providerId: string;
  recipient: string;
  status: (typeof states)[keyof typeof states];
};
export function readProviderReceipt(raw: unknown): ProviderEmailReceipt | null {
  if (
    typeof raw !== 'object' ||
    raw === null ||
    !('type' in raw) ||
    typeof raw.type !== 'string' ||
    !Object.hasOwn(states, raw.type)
  )
    return null;
  if (
    !('data' in raw) ||
    typeof raw.data !== 'object' ||
    raw.data === null ||
    !('tags' in raw.data) ||
    typeof raw.data.tags !== 'object' ||
    raw.data.tags === null ||
    !Object.hasOwn(raw.data.tags, 'snapform_delivery')
  )
    return null;
  const parsed = payload.safeParse(raw);
  if (!parsed.success) throw Error('INVALID_PROVIDER_EVENT');
  const value = parsed.data;
  return {
    deliveryId: value.data.tags.snapform_delivery,
    providerId: value.data.email_id,
    recipient: value.data.to[0],
    status: states[value.type],
  };
}
