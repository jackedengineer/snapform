import type { Field } from './form.ts';
import type { Answer } from './answers.ts';
const states = {
  missing: 'Not answered',
  blank: 'Left blank',
  refused: 'Prefer not to answer',
  'not-applicable': 'Not applicable',
};
const numbers = new Intl.NumberFormat('en', { maximumFractionDigits: 20 });
const relative = new Intl.RelativeTimeFormat('en', { numeric: 'auto' });
const units: [Intl.RelativeTimeFormatUnit, number][] = [
  ['year', 31536000],
  ['month', 2592000],
  ['week', 604800],
  ['day', 86400],
  ['hour', 3600],
  ['minute', 60],
];
// Clock skew can place a fresh submission slightly in the future.
export function formatRelativeTime(iso: string, now: number): string {
  const seconds = Math.min(0, (Date.parse(iso) - now) / 1000);
  for (const [unit, size] of units)
    if (-seconds >= size)
      return relative.format(Math.trunc(seconds / size), unit);
  return 'just now';
}
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
