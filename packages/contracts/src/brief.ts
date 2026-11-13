import { z } from './zod.ts';

const budget = z.number().check(z.int(), z.minimum(0), z.maximum(10_000_000));

export const briefSchema = z.strictObject({
  goal: z
    .string()
    .check(
      z.trim(),
      z.minLength(10, 'Describe your goal in at least 10 characters.'),
      z.maxLength(1000, 'Use 1,000 characters or fewer.'),
    ),
  budget,
  currency: z.enum(['USD', 'INR', 'EUR']),
  targetDate: z.iso.date('Choose a valid calendar date.'),
});

export const briefFormSchema = z.extend(briefSchema, {
  budget: z.pipe(
    z.pipe(
      z
        .string()
        .check(
          z.trim(),
          z.minLength(1, 'Enter a budget, including zero.'),
          z.regex(/^\d+$/, 'Use whole currency units.'),
        ),
      z.transform(Number),
    ),
    budget,
  ),
});

export const reviewResponseSchema = z.strictObject({ brief: briefSchema });
export type Brief = z.infer<typeof briefSchema>;
export type BriefFormValues = z.input<typeof briefFormSchema>;
