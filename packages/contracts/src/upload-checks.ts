import { MAX_UPLOAD_NAME, uploadTypes } from './uploads.ts';
import type { UploadType } from './uploads.ts';
// Server-side upload checks. They never trust the declared type or name:
// every allowed type has a byte-level check, and names are display text only.
export type UploadKind = 'signature' | 'office' | 'text';
export function uploadKind(type: UploadType): UploadKind {
  if (type.startsWith('text/')) return 'text';
  return type.includes('openxmlformats') ? 'office' : 'signature';
}

const hidden = /[\p{Cc}\p{Cf}\p{Zl}\p{Zp}]/gu;
const loneSurrogate =
  /[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/g;
const reservedCharacters = /[<>:"/\\|?*]/g;
const deviceName = /^(?:con|prn|aux|nul|com\d|lpt\d)(?:\.|$)/i;
/**
 * A display and download name: no path, control, bidirectional or invisible
 * characters, at most 200 characters, ending in an extension for the type
 * that was verified. It is never used in a storage key.
 */
export function cleanFileName(raw: string, type: UploadType): string {
  const extensions: readonly string[] = uploadTypes[type];
  let name = raw.replace(loneSurrogate, '').normalize('NFC');
  name = name
    .slice(Math.max(name.lastIndexOf('/'), name.lastIndexOf('\\')) + 1)
    .replace(hidden, '')
    .replace(reservedCharacters, '_')
    .replace(/\s+/g, ' ')
    .replace(/^[\s.]+|[\s.]+$/g, '');
  const dot = name.lastIndexOf('.');
  const extension = dot > 0 ? name.slice(dot + 1).toLowerCase() : '';
  const kept = extensions.includes(extension);
  const suffix = kept ? extension : extensions[0];
  let stem = Array.from(kept ? name.slice(0, dot) : name)
    .slice(0, MAX_UPLOAD_NAME - suffix.length - 1)
    .join('')
    .replace(/[\s.]+$/, '');
  if (!stem) stem = 'file';
  if (deviceName.test(stem)) stem = '_' + stem;
  return `${stem}.${suffix}`;
}
/** RFC 6266 attachment header with an ASCII fallback and a UTF-8 name. */
export function attachmentDisposition(name: string): string {
  const fallback = name.replace(/[^\x20-\x7e]|["\\%;]/g, '_');
  const encoded = encodeURIComponent(name).replace(
    /['()*]/g,
    (character) => '%' + character.charCodeAt(0).toString(16).toUpperCase(),
  );
  return `attachment; filename="${fallback}"; filename*=UTF-8''${encoded}`;
}

export const SIGNATURE_BYTES = 12;
const bytes = (text: string) => Array.from(text, (c) => c.charCodeAt(0));
const at = (head: Uint8Array, expected: number[], offset = 0) =>
  head.length >= offset + expected.length &&
  expected.every((value, index) => head[offset + index] === value);
const zip = [0x50, 0x4b, 0x03, 0x04];
const signatures: Record<UploadType, (head: Uint8Array) => boolean> = {
  'application/pdf': (head) => at(head, bytes('%PDF-')),
  'image/png': (head) =>
    at(head, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
  'image/jpeg': (head) => at(head, [0xff, 0xd8, 0xff]),
  'image/webp': (head) => at(head, bytes('RIFF')) && at(head, bytes('WEBP'), 8),
  'image/gif': (head) => at(head, bytes('GIF87a')) || at(head, bytes('GIF89a')),
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': (
    head,
  ) => at(head, zip),
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': (head) =>
    at(head, zip),
  'application/vnd.openxmlformats-officedocument.presentationml.presentation': (
    head,
  ) => at(head, zip),
  // Text has no signature; textCheck validates every byte instead.
  'text/plain': () => true,
  'text/csv': () => true,
};
/** Checks the first SIGNATURE_BYTES of a file against its declared type. */
export function matchesSignature(head: Uint8Array, type: UploadType): boolean {
  return signatures[type](head);
}
/** Streaming check: valid UTF-8 (a BOM is fine) with no NUL bytes. */
export function textCheck() {
  const decoder = new TextDecoder('utf-8', { fatal: true });
  let valid = true;
  return {
    push(chunk: Uint8Array) {
      try {
        if (valid && chunk.includes(0)) valid = false;
        if (valid) decoder.decode(chunk, { stream: true });
      } catch {
        valid = false;
      }
      return valid;
    },
    end() {
      try {
        if (valid) decoder.decode();
      } catch {
        valid = false;
      }
      return valid;
    },
  };
}

export type ZipEntry = {
  name: string;
  flags: number;
  method: number;
  compressedSize: number;
  size: number;
  offset: number;
};
/** Bytes of the file's end kept while streaming; holds the central directory. */
export const ZIP_TAIL_BYTES = 1024 * 1024;
/**
 * Reads the central directory from the end of a single-disk, non-ZIP64
 * archive. tail is the last bytes of a file of fileSize bytes. Anything
 * inconsistent returns null.
 */
export function readZipDirectory(
  tail: Uint8Array,
  fileSize: number,
): ZipEntry[] | null {
  const view = new DataView(tail.buffer, tail.byteOffset, tail.byteLength);
  const base = fileSize - tail.length;
  const names = new TextDecoder();
  const first = Math.max(0, tail.length - 22 - 0xffff);
  for (let end = tail.length - 22; end >= first; end--) {
    if (view.getUint32(end, true) !== 0x06054b50) continue;
    if (end + 22 + view.getUint16(end + 20, true) !== tail.length) continue;
    const count = view.getUint16(end + 10, true),
      size = view.getUint32(end + 12, true),
      start = view.getUint32(end + 16, true) - base;
    if (
      view.getUint32(end + 4, true) !== 0 ||
      view.getUint16(end + 8, true) !== count ||
      count === 0xffff ||
      start < 0 ||
      start + size !== end
    )
      return null;
    const entries: ZipEntry[] = [];
    let cursor = start;
    for (let index = 0; index < count; index++) {
      if (cursor + 46 > end || view.getUint32(cursor, true) !== 0x02014b50)
        return null;
      const nameLength = view.getUint16(cursor + 28, true),
        next =
          cursor +
          46 +
          nameLength +
          view.getUint16(cursor + 30, true) +
          view.getUint16(cursor + 32, true);
      if (next > end) return null;
      const entry = {
        name: names.decode(
          tail.subarray(cursor + 46, cursor + 46 + nameLength),
        ),
        flags: view.getUint16(cursor + 8, true),
        method: view.getUint16(cursor + 10, true),
        compressedSize: view.getUint32(cursor + 20, true),
        size: view.getUint32(cursor + 24, true),
        offset: view.getUint32(cursor + 42, true),
      };
      if (
        entry.compressedSize === 0xffffffff ||
        entry.size === 0xffffffff ||
        entry.offset + 30 + entry.compressedSize > base + start
      )
        return null;
      entries.push(entry);
      cursor = next;
    }
    return cursor === end ? entries : null;
  }
  return null;
}
type OfficeType = Extract<UploadType, `${string}openxmlformats${string}`>;
const officeParts: Record<OfficeType, [part: string, mainType: string]> = {
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': [
    'word/document.xml',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml',
  ],
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': [
    'xl/workbook.xml',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml',
  ],
  'application/vnd.openxmlformats-officedocument.presentationml.presentation': [
    'ppt/presentation.xml',
    'application/vnd.openxmlformats-officedocument.presentationml.presentation.main+xml',
  ],
};
export const MAX_MANIFEST_BYTES = 1024 * 1024;
/**
 * An Office document is a zip with the package manifest, relationships and the
 * type's main part, no macro project and no encrypted entries. Returns the
 * manifest entry, whose content officeManifestMatches then checks.
 */
export function officeManifest(
  entries: ZipEntry[],
  type: OfficeType,
): ZipEntry | null {
  const names = new Set(entries.map((entry) => entry.name));
  const manifest = entries.find(
    (entry) => entry.name === '[Content_Types].xml',
  );
  if (
    names.size !== entries.length ||
    !names.has('_rels/.rels') ||
    !names.has(officeParts[type][0]) ||
    entries.some(
      (entry) =>
        entry.flags & 1 || /(?:^|\/)vbaProject\.bin$/i.test(entry.name),
    ) ||
    !manifest ||
    ![0, 8].includes(manifest.method) ||
    manifest.size > MAX_MANIFEST_BYTES
  )
    return null;
  return manifest;
}
/** Offset of entry data after a local file header (first 30 bytes). */
export function localDataOffset(header: Uint8Array): number | null {
  if (header.length < 30) return null;
  const view = new DataView(header.buffer, header.byteOffset, 30);
  if (view.getUint32(0, true) !== 0x04034b50) return null;
  return 30 + view.getUint16(26, true) + view.getUint16(28, true);
}
export function officeManifestMatches(xml: string, type: OfficeType): boolean {
  const main = officeParts[type][1].replaceAll('.', '\\.').replace('+', '\\+');
  return (
    new RegExp(`ContentType=["']${main}["']`).test(xml) &&
    !/macroEnabled/i.test(xml)
  );
}
