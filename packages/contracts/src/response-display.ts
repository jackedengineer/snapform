import type { Field } from './form.ts';
import type { Answer } from './answers.ts';
const states = {
  missing: 'Not answered',
  blank: 'Left blank',
  refused: 'Prefer not to answer',
  'not-applicable': 'Not applicable',
};
const numbers = new Intl.NumberFormat('en', { maximumFractionDigits: 20 });
export function formatResponseAnswer(
  field: Field,
  answer: Answer | undefined,
): string {
  if (!answer) return states.missing;
  if (answer.state !== 'value') return states[answer.state];
  const value = answer.value;
  if (field.type === 'single-choice' || field.type === 'multiple-choice') {
    const ids = Array.isArray(value) ? value : [String(value)];
    return ids
      .map(
        (id) =>
          field.options.find((option) => option.id === id)?.label ??
          'Unavailable choice',
      )
      .join('\n');
  }
  if (field.type === 'number' && typeof value === 'number') {
    const formatted = numbers.format(value);
    if (field.unit.kind === 'currency')
      return `${field.unit.code} ${formatted}`;
    if (field.unit.kind === 'percent') return `${formatted}%`;
    if (field.unit.kind === 'custom') return `${formatted} ${field.unit.label}`;
    return formatted;
  }
  if (typeof value === 'boolean') return value ? 'Yes' : 'No';
  return Array.isArray(value) ? value.join('\n') : String(value);
}
