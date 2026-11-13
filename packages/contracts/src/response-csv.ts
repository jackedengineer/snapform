import { formDefinitionSchema } from './form.ts';
import type { Field, FormDefinition } from './form.ts';
import { sessionAnswersSchema } from './intake.ts';
import type { Answer } from './answers.ts';
import { formatResponseAnswer } from './response-display.ts';
import { publishFormSchema } from './publication.ts';
import { z } from './zod.ts';
// An export names one published version, with no other query parameters.
export const responseExportQuerySchema = z.pick(publishFormSchema, {
  versionId: true,
});
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
// Downloads are named from a bounded ASCII slug so the header needs no escaping.
export const EXPORT_FILENAME_PATTERN = /^[a-z0-9][a-z0-9-]{0,95}\.csv$/;
export function responseExportFilename(
  title: string,
  version: number,
  exportedAt: Date,
): string {
  const slug =
    title
      .normalize('NFKD')
      .replace(/\p{M}/gu, '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+/, '')
      .slice(0, 60)
      .replace(/-+$/, '') || 'responses';
  const suffix = version > 1 ? `-v${version}` : '';
  return `${slug}${suffix}-${exportedAt.toISOString().slice(0, 10)}.csv`;
}
const submittedHeader = 'Submitted (UTC)';
function submittedCell(value: string) {
  const match = value.match(
    /^(\d{4}-\d{2}-\d{2})T(\d{2}:\d{2}):\d{2}(?:\.\d{1,6})?Z$/,
  );
  if (!match) throw Error('INVALID_EXPORT_VALUE');
  return `${match[1]} ${match[2]}`;
}
function questionHeaders(fields: Field[]) {
  const used = new Set([submittedHeader]);
  return fields.map((field) => {
    const unit = field.type === 'number' ? field.unit : undefined;
    const suffix =
      unit?.kind === 'currency'
        ? unit.code
        : unit?.kind === 'percent'
          ? '%'
          : unit?.kind === 'custom'
            ? unit.label
            : '';
    const base = `${field.label.trim() || 'Untitled question'}${suffix ? ` (${suffix})` : ''}`;
    let header = base;
    for (let copy = 2; used.has(header); copy++) header = `${base} (${copy})`;
    used.add(header);
    return header;
  });
}
function answerCell(
  field: Field,
  answer: Answer | undefined,
): string | number | boolean {
  if (answer?.state === 'refused') return formatResponseAnswer(field, answer);
  if (answer?.state !== 'value') return '';
  return typeof answer.value === 'number' || typeof answer.value === 'boolean'
    ? answer.value
    : formatResponseAnswer(field, answer);
}
export function createResponseCsv(
  definition: FormDefinition,
  rows: { submittedAt: string; answers: Record<string, Answer> }[],
): string {
  if (rows.length > MAX_EXPORT_ROWS) throw Error('EXPORT_TOO_LARGE');
  const fields = formDefinitionSchema
    .parse(definition)
    .pages.flatMap((page) => page.blocks)
    .filter((block) => 'label' in block);
  const header = [submittedHeader, ...questionHeaders(fields)]
    .map(encodeCsvCell)
    .join(',');
  const lines = [header];
  const encoder = new TextEncoder();
  let bytes = 3 + encoder.encode(header + '\r\n').byteLength;
  for (const row of rows) {
    const answers = sessionAnswersSchema.parse(row.answers);
    const line = [
      submittedCell(row.submittedAt),
      ...fields.map((field) => answerCell(field, answers[field.id])),
    ]
      .map(encodeCsvCell)
      .join(',');
    bytes += encoder.encode(line + '\r\n').byteLength;
    if (bytes > MAX_CSV_BYTES) throw Error('EXPORT_TOO_LARGE');
    lines.push(line);
  }
  return '\uFEFF' + lines.join('\r\n') + '\r\n';
}
