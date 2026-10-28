import { z } from 'zod';

const budget = z.number().int().min(0).max(10_000_000);

export const briefSchema = z.strictObject({
  goal: z
    .string()
    .trim()
    .min(10, 'Describe your goal in at least 10 characters.')
    .max(1000, 'Use 1,000 characters or fewer.'),
  budget,
  currency: z.enum(['USD', 'INR', 'EUR']),
  targetDate: z.iso.date('Choose a valid calendar date.'),
});

export const briefFormSchema = briefSchema.extend({
  budget: z
    .string()
    .trim()
    .min(1, 'Enter a budget, including zero.')
    .regex(/^\d+$/, 'Use whole currency units.')
    .transform(Number)
    .pipe(budget),
});

export const reviewResponseSchema = z.strictObject({ brief: briefSchema });
export type Brief = z.infer<typeof briefSchema>;
export type BriefFormValues = z.input<typeof briefFormSchema>;
