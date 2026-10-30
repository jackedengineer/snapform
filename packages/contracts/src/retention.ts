import { z } from 'zod';
import { roleSchema } from './workspace.ts';
export const retentionDaysSchema = z.union([
  z.literal(30),
  z.literal(90),
  z.literal(365),
]);
export const retentionInputSchema = z.strictObject({
  days: retentionDaysSchema,
  expectedRevision: z.int().min(0).max(2147483646),
  acknowledgeDeletion: z.literal(true),
});
export const retentionSettingsSchema = z.strictObject({
  workspaceId: z.uuid().transform((value) => value.toLowerCase()),
  role: roleSchema,
  days: retentionDaysSchema,
  revision: z.int().min(0),
  updatedAt: z.iso.datetime().nullable(),
});
export type RetentionInput = z.infer<typeof retentionInputSchema>;
export type RetentionSettings = z.infer<typeof retentionSettingsSchema>;
