import { z } from './zod.ts';

export const responseEventMessageSchema = z.strictObject({
  version: z.literal(1),
  eventId: z.uuid(),
});
export type ResponseEventMessage = z.infer<typeof responseEventMessageSchema>;
