import { formDefinitionSchema } from './form.ts';
import type { FormDefinition } from './form.ts';
import { sessionAnswersSchema } from './intake.ts';
import type { Answer } from './answers.ts';
import { formatResponseAnswer } from './response-display.ts';
export const MAX_EXPORT_ROWS = 1000;
export const MAX_EXPORT_ANSWER_BYTES = 1048576;
export const MAX_CSV_BYTES = 2097152;
export function encodeCsvCell(value: string | number | boolean): string {
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) throw Error('INVALID_EXPORT_VALUE');
    return String(value);
  }
  if (typeof value === 'boolean') return value ? 'TRUE' : 'FALSE';
  const text =
    /^[\t\r\n]/.test(value) || /^[\s\p{Cc}]*[=+\-@＝＋－＠]/u.test(value)
      ? `'${value}`
      : value;
  return `"${text.replaceAll('"', '""')}"`;
}
export function createResponseCsv(
  definition: FormDefinition,
  version: number,
  rows: { id: string; submittedAt: string; answers: Record<string, Answer> }[],
): string {
  if (rows.length > MAX_EXPORT_ROWS) throw Error('EXPORT_TOO_LARGE');
  const fields = formDefinitionSchema
    .parse(definition)
    .pages.flatMap((page) => page.blocks)
    .filter((block) => 'label' in block);
  const header = [
    'Reference',
    'Submitted at (UTC)',
    'Version',
    ...fields.flatMap((field) => {
      const unit = field.type === 'number' ? field.unit : undefined;
      const suffix =
        unit?.kind === 'currency'
          ? unit.code
          : unit?.kind === 'percent'
            ? '%'
            : unit?.kind === 'custom'
              ? unit.label
              : '';
      const header = `${field.label}${suffix ? ` (${suffix})` : ''} [${field.id}]`;
      return [header, `${header} (state)`];
    }),
  ]
    .map(encodeCsvCell)
    .join(',');
  const lines = [header];
  const encoder = new TextEncoder();
  let bytes = 3 + encoder.encode(header + '\r\n').byteLength;
  for (const row of rows) {
    const answers = sessionAnswersSchema.parse(row.answers);
    const values: (string | number | boolean)[] = [
      row.id,
      row.submittedAt,
      version,
    ];
    for (const field of fields) {
      const answer = answers[field.id];
      values.push(
        answer?.state === 'value' &&
          typeof answer.value !== 'string' &&
          !Array.isArray(answer.value)
          ? answer.value
          : formatResponseAnswer(field, answer),
        answer?.state ?? 'missing',
      );
    }
    const line = values.map(encodeCsvCell).join(',');
    bytes += encoder.encode(line + '\r\n').byteLength;
    if (bytes > MAX_CSV_BYTES) throw Error('EXPORT_TOO_LARGE');
    lines.push(line);
  }
  return '\uFEFF' + lines.join('\r\n') + '\r\n';
}
