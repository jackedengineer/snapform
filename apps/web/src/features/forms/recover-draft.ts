import type { FormDefinition } from '@snapform/contracts/form';
type DraftValues = Omit<FormDefinition, 'rules'>;
export function recoverDraft(
  form: {
    reset: (
      values: DraftValues,
      options: { keepDefaultValues: boolean },
    ) => void;
  },
  definition: FormDefinition,
) {
  const { rules, ...values } = definition;
  // useForm reapplies its original options after render. Keep those defaults stable
  // while replacing the recovered values; server acknowledgment is tracked separately.
  form.reset(values, { keepDefaultValues: true });
  return { rules, values };
}
