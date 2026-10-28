import { z } from 'zod';
import { isStorableText } from './text.ts';

export type Condition =
  | { op: 'answered'; fieldId: string }
  | { op: 'unanswered'; fieldId: string }
  | {
      op: 'eq' | 'neq' | 'gt' | 'gte' | 'lt' | 'lte';
      fieldId: string;
      value: string | number | boolean;
    }
  | { op: 'contains'; fieldId: string; optionId: string }
  | { op: 'and'; conditions: Condition[] }
  | { op: 'or'; conditions: Condition[] }
  | { op: 'not'; condition: Condition };
const identity = z.uuid().transform((value) => value.toLowerCase());
const predicate = z.discriminatedUnion('op', [
  z.strictObject({ op: z.enum(['answered', 'unanswered']), fieldId: identity }),
  z.strictObject({
    op: z.enum(['eq', 'neq', 'gt', 'gte', 'lt', 'lte']),
    fieldId: identity,
    value: z.union([
      z.string().max(10000).refine(isStorableText),
      z.number(),
      z.boolean(),
    ]),
  }),
  z.strictObject({
    op: z.literal('contains'),
    fieldId: identity,
    optionId: identity,
  }),
]);
// Build a finite schema rather than recursively parsing unbounded untrusted input.
let boundedCondition: z.ZodType<Condition> = predicate;
for (let depth = 1; depth < 4; depth++) {
  boundedCondition = z.union([
    predicate,
    z.strictObject({
      op: z.enum(['and', 'or']),
      conditions: z.array(boundedCondition).min(1).max(8),
    }),
    z.strictObject({ op: z.literal('not'), condition: boundedCondition }),
  ]);
}
export const conditionSchema = boundedCondition;
export const ruleSchema = z.strictObject({
  id: identity,
  priority: z.int().min(0).max(29),
  condition: conditionSchema,
  action: z.discriminatedUnion('type', [
    z.strictObject({ type: z.literal('show'), fieldId: identity }),
    z.strictObject({
      type: z.literal('go-to'),
      fromPageId: identity,
      pageId: identity,
    }),
    z.strictObject({
      type: z.literal('end'),
      fromPageId: identity,
      endingId: identity,
    }),
  ]),
});
export type Rule = z.infer<typeof ruleSchema>;
