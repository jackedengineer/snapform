import { z } from './zod.ts';
import { roleSchema } from './workspace.ts';
export const retentionDaysSchema = z.union([
  z.literal(30),
  z.literal(90),
  z.literal(365),
]);
export const retentionInputSchema = z.strictObject({
  days: retentionDaysSchema,
  expectedRevision: z.int().check(z.minimum(0), z.maximum(2147483646)),
  acknowledgeDeletion: z.literal(true),
});
export const retentionSettingsSchema = z.strictObject({
  workspaceId: z.pipe(
    z.uuid(),
    z.transform((value: string) => value.toLowerCase()),
  ),
  role: roleSchema,
  days: retentionDaysSchema,
  revision: z.int().check(z.minimum(0)),
  updatedAt: z.nullable(z.iso.datetime()),
});
export type RetentionInput = z.infer<typeof retentionInputSchema>;
export type RetentionSettings = z.infer<typeof retentionSettingsSchema>;
