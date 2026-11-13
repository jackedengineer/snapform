import { z } from './zod.ts';
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
const identity = z.pipe(
  z.uuid(),
  z.transform((value: string) => value.toLowerCase()),
);
const predicate = z.discriminatedUnion('op', [
  z.strictObject({ op: z.enum(['answered', 'unanswered']), fieldId: identity }),
  z.strictObject({
    op: z.enum(['eq', 'neq', 'gt', 'gte', 'lt', 'lte']),
    fieldId: identity,
    value: z.union([
      z.string().check(z.maxLength(10000), z.refine(isStorableText)),
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
let boundedCondition: z.ZodMiniType<Condition> = predicate;
for (let depth = 1; depth < 4; depth++) {
  boundedCondition = z.union([
    predicate,
    z.strictObject({
      op: z.enum(['and', 'or']),
      conditions: z
        .array(boundedCondition)
        .check(z.minLength(1), z.maxLength(8)),
    }),
    z.strictObject({ op: z.literal('not'), condition: boundedCondition }),
  ]);
}
export const conditionSchema = boundedCondition;
export const ruleSchema = z.strictObject({
  id: identity,
  priority: z.int().check(z.minimum(0), z.maximum(29)),
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
