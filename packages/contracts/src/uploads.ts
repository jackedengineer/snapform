import { z } from './zod.ts';
import { isStorableText } from './text.ts';
// Upload rules shared by the collector, API and database (migration 0046
// repeats the size and type limits). Malware scanning is not implemented yet:
// files are private, allow-listed, signature-checked and only downloaded as
// attachments. See ADR-024.
export const MAX_UPLOAD_BYTES = 25 * 1024 * 1024;
export const MAX_UPLOAD_NAME = 200;
/** Canonical type and its accepted extensions; the first one is canonical. */
export const uploadTypes = {
  'application/pdf': ['pdf'],
  'image/png': ['png'],
  'image/jpeg': ['jpg', 'jpeg'],
  'image/webp': ['webp'],
  'image/gif': ['gif'],
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': [
    'docx',
  ],
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': ['xlsx'],
  'application/vnd.openxmlformats-officedocument.presentationml.presentation': [
    'pptx',
  ],
  'text/plain': ['txt'],
  'text/csv': ['csv'],
} as const;
export type UploadType = keyof typeof uploadTypes;
const types = Object.keys(uploadTypes) as [UploadType, ...UploadType[]];
export const uploadTypeSchema = z.enum(types);
export function isUploadType(value: unknown): value is UploadType {
  return typeof value === 'string' && Object.hasOwn(uploadTypes, value);
}
/** For the file input: extensions plus types, so phones offer the photo library. */
export const uploadAccept = [
  ...types.flatMap((type) => uploadTypes[type].map((ext) => '.' + ext)),
  ...types.filter((type) => type.startsWith('image/')),
].join(',');
// Browsers report some files under other names (Windows reports CSV as Excel)
// or not at all. The server checks the bytes either way.
const aliases: Partial<Record<UploadType, readonly string[]>> = {
  'image/jpeg': ['image/jpg', 'image/pjpeg'],
  'text/csv': [
    'text/plain',
    'application/csv',
    'text/x-csv',
    'application/vnd.ms-excel',
  ],
};
/** The declared type for a picked file, or null when it isn't allowed. */
export function uploadTypeFor(
  name: string,
  reported: string,
): UploadType | null {
  const extension = name.includes('.')
    ? name.slice(name.lastIndexOf('.') + 1).toLowerCase()
    : '';
  const type = types.find((item) =>
    (uploadTypes[item] as readonly string[]).includes(extension),
  );
  if (!type) return null;
  const browser = reported.split(';')[0].trim().toLowerCase();
  return !browser ||
    browser === 'application/octet-stream' ||
    browser === type ||
    aliases[type]?.includes(browser)
    ? type
    : null;
}
export const uploadedFileSchema = z.strictObject({
  id: z.uuid(),
  questionId: z.uuid(),
  name: z
    .string()
    .check(
      z.minLength(1),
      z.maxLength(MAX_UPLOAD_NAME),
      z.refine(isStorableText),
    ),
  size: z.int().check(z.minimum(1), z.maximum(MAX_UPLOAD_BYTES)),
  type: uploadTypeSchema,
});
export type UploadedFile = z.infer<typeof uploadedFileSchema>;
export const uploadedFilesSchema = z
  .array(uploadedFileSchema)
  .check(z.maxLength(150));
const sizes = new Intl.NumberFormat('en', { maximumFractionDigits: 1 });
export function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} ${bytes === 1 ? 'byte' : 'bytes'}`;
  if (bytes < 1024 * 1024) return `${sizes.format(bytes / 1024)} KB`;
  return `${sizes.format(bytes / 1024 / 1024)} MB`;
}
export function hasFileQuestion(definition: {
  pages: readonly { blocks: readonly { type: string }[] }[];
}): boolean {
  return definition.pages.some((page) =>
    page.blocks.some((block) => block.type === 'file'),
  );
}
