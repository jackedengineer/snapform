import { describe, expect, it } from 'vitest';
import {
  attachmentDisposition,
  cleanFileName,
  localDataOffset,
  matchesSignature,
  officeManifest,
  officeManifestMatches,
  readZipDirectory,
  textCheck,
  uploadKind,
} from './upload-checks.ts';
import type { ZipEntry } from './upload-checks.ts';
import { uploadTypes } from './uploads.ts';
import type { UploadType } from './uploads.ts';

const docx =
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
const xlsx =
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
const pptx =
  'application/vnd.openxmlformats-officedocument.presentationml.presentation';
const ascii = (text: string) => Uint8Array.from(text, (c) => c.charCodeAt(0));

// A minimal stored (uncompressed) zip with a central directory and EOCD.
function zipOf(
  files: { name: string; data?: string; flags?: number; method?: number }[],
  comment = '',
) {
  const parts: number[] = [],
    directory: number[] = [];
  const u16 = (out: number[], value: number) =>
    out.push(value & 0xff, value >> 8);
  const u32 = (out: number[], value: number) =>
    out.push(
      value & 0xff,
      (value >> 8) & 0xff,
      (value >> 16) & 0xff,
      value >>> 24,
    );
  for (const file of files) {
    const name = ascii(file.name),
      data = ascii(file.data ?? 'x'),
      offset = parts.length;
    u32(parts, 0x04034b50);
    [20, file.flags ?? 0, file.method ?? 0, 0, 0].forEach((v) => u16(parts, v));
    [0, data.length, data.length].forEach((v) => u32(parts, v));
    [name.length, 0].forEach((v) => u16(parts, v));
    parts.push(...name, ...data);
    u32(directory, 0x02014b50);
    [20, 20, file.flags ?? 0, file.method ?? 0, 0, 0].forEach((v) =>
      u16(directory, v),
    );
    [0, data.length, data.length].forEach((v) => u32(directory, v));
    [name.length, 0, 0, 0, 0].forEach((v) => u16(directory, v));
    [0, offset].forEach((v) => u32(directory, v));
    directory.push(...name);
  }
  const end: number[] = [];
  u32(end, 0x06054b50);
  [0, 0, files.length, files.length].forEach((v) => u16(end, v));
  [directory.length, parts.length].forEach((v) => u32(end, v));
  u16(end, comment.length);
  end.push(...ascii(comment));
  return Uint8Array.from([...parts, ...directory, ...end]);
}
const office = (main: string, extra: { name: string }[] = []) =>
  zipOf([
    { name: '[Content_Types].xml', data: '<Types/>' },
    { name: '_rels/.rels' },
    { name: main },
    ...extra,
  ]);
const entries = (bytes: Uint8Array) => {
  const read = readZipDirectory(bytes, bytes.length);
  if (!read) throw Error('Expected a zip directory');
  return read;
};

describe('file names', () => {
  it('keeps a readable name and the verified extension', () => {
    expect(cleanFileName('Brief.PDF', 'application/pdf')).toBe('Brief.pdf');
    expect(cleanFileName('  .hidden report.  ', 'text/plain')).toBe(
      'hidden report.txt',
    );
    expect(cleanFileName('photo.jpeg', 'image/jpeg')).toBe('photo.jpeg');
    expect(cleanFileName('Résumé — 2026.docx', docx)).toBe(
      'Résumé — 2026.docx',
    );
    expect(cleanFileName('e\u0301te.txt', 'text/plain')).toBe('\u00e9te.txt');
  });
  it('drops paths, controls and reserved characters', () => {
    expect(cleanFileName('../../etc/passwd', 'text/plain')).toBe('passwd.txt');
    expect(cleanFileName('C:\\Users\\me\\x.csv', 'text/csv')).toBe('x.csv');
    expect(cleanFileName('a<b>:"c|?*.pdf', 'application/pdf')).toBe(
      'a_b___c___.pdf',
    );
    expect(cleanFileName('line\r\nbreak\t.txt', 'text/plain')).toBe(
      'linebreak.txt',
    );
    expect(cleanFileName('..', 'application/pdf')).toBe('file.pdf');
    expect(cleanFileName('\uD800scan.png', 'image/png')).toBe('scan.png');
  });
  it('removes bidirectional and invisible characters used to spoof extensions', () => {
    // Displayed as "invoiceexe.pdf" when the override is honored.
    expect(cleanFileName('invoice\u202Efdp.exe', 'application/pdf')).toBe(
      'invoicefdp.exe.pdf',
    );
    expect(
      cleanFileName('\u2067report\u2069\u200b\u200e.txt', 'text/plain'),
    ).toBe('report.txt');
    expect(cleanFileName('تقرير.pdf', 'application/pdf')).toBe('تقرير.pdf');
  });
  it('never lets a disguised extension through', () => {
    expect(cleanFileName('invoice.pdf.exe', 'application/pdf')).toBe(
      'invoice.pdf.exe.pdf',
    );
    expect(cleanFileName('page.html', 'text/plain')).toBe('page.html.txt');
    expect(cleanFileName('photo', 'image/webp')).toBe('photo.webp');
  });
  it('avoids Windows device names', () => {
    expect(cleanFileName('CON.txt', 'text/plain')).toBe('_CON.txt');
    expect(cleanFileName('lpt1.tar.csv', 'text/csv')).toBe('_lpt1.tar.csv');
    expect(cleanFileName('console.txt', 'text/plain')).toBe('console.txt');
  });
  it('limits names to 200 characters without splitting characters', () => {
    const long = cleanFileName('😀'.repeat(300) + '.pdf', 'application/pdf');
    expect(Array.from(long)).toHaveLength(200);
    expect(long.endsWith('😀.pdf')).toBe(true);
    expect(long.isWellFormed()).toBe(true);
    const spaced = cleanFileName(
      'a'.repeat(195) + ' . b.pdf',
      'application/pdf',
    );
    expect(spaced).toBe('a'.repeat(195) + '.pdf');
  });
  it('builds an attachment header with an ASCII fallback', () => {
    expect(attachmentDisposition('Brief.pdf')).toBe(
      `attachment; filename="Brief.pdf"; filename*=UTF-8''Brief.pdf`,
    );
    expect(attachmentDisposition(`Ré "q"; 100%'(x)*.txt`)).toBe(
      `attachment; filename="R_ _q__ 100_'(x)*.txt"; filename*=UTF-8''R%C3%A9%20%22q%22%3B%20100%25%27%28x%29%2A.txt`,
    );
  });
});

describe('signatures', () => {
  const samples: Record<UploadType, Uint8Array> = {
    'application/pdf': ascii('%PDF-1.7\n'),
    'image/png': Uint8Array.of(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a),
    'image/jpeg': Uint8Array.of(0xff, 0xd8, 0xff, 0xe0),
    'image/webp': ascii('RIFF\x10\0\0\0WEBPVP8 '),
    'image/gif': ascii('GIF89a'),
    [docx]: ascii('PK\x03\x04'),
    [xlsx]: ascii('PK\x03\x04'),
    [pptx]: ascii('PK\x03\x04'),
    'text/plain': ascii('hello'),
    'text/csv': ascii('a,b'),
  };
  it('accepts each allowed type only with its own signature', () => {
    for (const type of Object.keys(uploadTypes) as UploadType[]) {
      expect(matchesSignature(samples[type], type)).toBe(true);
      if (uploadKind(type) === 'text') continue;
      for (const other of [
        'application/pdf',
        'image/png',
        'image/gif',
      ] as const)
        if (other !== type)
          expect(matchesSignature(samples[other], type)).toBe(false);
    }
    expect(matchesSignature(ascii('GIF87a'), 'image/gif')).toBe(true);
    expect(matchesSignature(ascii('RIFF\0\0\0\0WAVE'), 'image/webp')).toBe(
      false,
    );
    // An HTML page or SVG declared as an image or PDF.
    expect(matchesSignature(ascii('<svg xmlns='), 'image/png')).toBe(false);
    expect(matchesSignature(ascii('<html>%PDF-'), 'application/pdf')).toBe(
      false,
    );
    expect(matchesSignature(new Uint8Array(), 'image/jpeg')).toBe(false);
  });
  it('groups types by how their bytes are checked', () => {
    expect(uploadKind('image/png')).toBe('signature');
    expect(uploadKind(xlsx)).toBe('office');
    expect(uploadKind('text/csv')).toBe('text');
  });
});

describe('text files', () => {
  const check = (...chunks: Uint8Array[]) => {
    const text = textCheck();
    return chunks.every((chunk) => text.push(chunk)) && text.end();
  };
  it('accepts UTF-8 split across chunks, with or without a BOM', () => {
    const bytes = new TextEncoder().encode('\uFEFFname,city\nZoë,Pune ✓\n');
    expect(check(bytes)).toBe(true);
    expect(check(bytes.subarray(0, 18), bytes.subarray(18))).toBe(true);
  });
  it('refuses NUL bytes, invalid sequences and truncated characters', () => {
    expect(check(ascii('a\0b'))).toBe(false);
    expect(check(Uint8Array.of(0xc3, 0x28))).toBe(false);
    expect(check(Uint8Array.of(0xe2, 0x82))).toBe(false);
    // A binary file declared as CSV.
    expect(check(Uint8Array.of(0x89, 0x50, 0x4e, 0x47))).toBe(false);
    const text = textCheck();
    expect(text.push(ascii('ok\0'))).toBe(false);
    expect(text.push(ascii('more'))).toBe(false);
    expect(text.end()).toBe(false);
  });
});

describe('Office documents', () => {
  it('reads the central directory of each document type', () => {
    const bytes = office('word/document.xml');
    const read = entries(bytes);
    expect(read.map((entry) => entry.name)).toEqual([
      '[Content_Types].xml',
      '_rels/.rels',
      'word/document.xml',
    ]);
    expect(read[0]).toEqual({
      name: '[Content_Types].xml',
      flags: 0,
      method: 0,
      compressedSize: 8,
      size: 8,
      offset: 0,
    });
    expect(officeManifest(read, docx)).toBe(read[0]);
    expect(officeManifest(entries(office('xl/workbook.xml')), xlsx)).not.toBe(
      null,
    );
    expect(
      officeManifest(entries(office('ppt/presentation.xml')), pptx),
    ).not.toBe(null);
    // Only the end of the file is kept while streaming.
    const tail = bytes.subarray(bytes.length - 210);
    expect(readZipDirectory(tail, bytes.length)).toEqual(read);
  });
  it('finds the directory behind an archive comment', () => {
    const bytes = zipOf(
      [
        { name: '[Content_Types].xml' },
        { name: '_rels/.rels' },
        { name: 'word/document.xml' },
      ],
      'PK\x05\x06 note',
    );
    expect(entries(bytes).map((entry) => entry.name)).toEqual([
      '[Content_Types].xml',
      '_rels/.rels',
      'word/document.xml',
    ]);
  });
  it('refuses archives that are not plain Office packages', () => {
    expect(officeManifest(entries(office('xl/workbook.xml')), docx)).toBeNull();
    expect(
      officeManifest(
        entries(office('word/document.xml', [{ name: 'word/vbaProject.bin' }])),
        docx,
      ),
    ).toBeNull();
    expect(
      officeManifest(
        entries(
          zipOf([{ name: '_rels/.rels' }, { name: 'word/document.xml' }]),
        ),
        docx,
      ),
    ).toBeNull();
    expect(
      officeManifest(
        entries(
          zipOf([
            { name: '[Content_Types].xml' },
            { name: 'word/document.xml' },
          ]),
        ),
        docx,
      ),
    ).toBeNull();
    const encrypted = zipOf([
      { name: '[Content_Types].xml' },
      { name: '_rels/.rels', flags: 1 },
      { name: 'word/document.xml' },
    ]);
    expect(officeManifest(entries(encrypted), docx)).toBeNull();
    const duplicate = office('word/document.xml', [
      { name: 'word/document.xml' },
    ]);
    expect(officeManifest(entries(duplicate), docx)).toBeNull();
    const unknownMethod = zipOf([
      { name: '[Content_Types].xml', method: 14 },
      { name: '_rels/.rels' },
      { name: 'word/document.xml' },
    ]);
    expect(officeManifest(entries(unknownMethod), docx)).toBeNull();
    const large: ZipEntry[] = entries(office('word/document.xml')).map(
      (entry, index) => (index ? entry : { ...entry, size: 1024 * 1024 + 1 }),
    );
    expect(officeManifest(large, docx)).toBeNull();
  });
  it('rejects damaged, multi-disk, ZIP64 and truncated directories', () => {
    const bytes = office('word/document.xml');
    const changed = (offset: number, value: number) => {
      const copy = bytes.slice();
      copy[bytes.length + offset] = value;
      return readZipDirectory(copy, copy.length);
    };
    expect(readZipDirectory(ascii('%PDF-1.7'), 8)).toBeNull();
    expect(readZipDirectory(new Uint8Array(), 0)).toBeNull();
    expect(changed(-18, 1)).toBeNull(); // another disk
    expect(changed(-14, 9)).toBeNull(); // count differs from this disk's
    const zip64 = bytes.slice();
    new DataView(zip64.buffer).setUint16(zip64.length - 14, 0xffff, true);
    new DataView(zip64.buffer).setUint16(zip64.length - 12, 0xffff, true);
    expect(readZipDirectory(zip64, zip64.length)).toBeNull();
    expect(changed(-9, 0xff)).toBeNull(); // directory size
    expect(changed(-2, 1)).toBeNull(); // comment length past the end
    expect(readZipDirectory(bytes.subarray(40), bytes.length)).not.toBeNull();
    expect(
      readZipDirectory(bytes.subarray(bytes.length - 32), bytes.length),
    ).toBeNull();
    const corrupt = bytes.slice();
    const start = new DataView(corrupt.buffer).getUint32(
      corrupt.length - 6,
      true,
    );
    corrupt[start] = 0;
    expect(readZipDirectory(corrupt, corrupt.length)).toBeNull();
    const nameLength = bytes.slice();
    new DataView(nameLength.buffer).setUint16(start + 28, 0xffff, true);
    expect(readZipDirectory(nameLength, nameLength.length)).toBeNull();
    const sized = bytes.slice();
    new DataView(sized.buffer).setUint32(start + 20, 0xffffffff, true);
    expect(readZipDirectory(sized, sized.length)).toBeNull();
    const offset = bytes.slice();
    new DataView(offset.buffer).setUint32(start + 42, start, true);
    expect(readZipDirectory(offset, offset.length)).toBeNull();
    const fewer = bytes.slice();
    new DataView(fewer.buffer).setUint16(fewer.length - 12, 2, true);
    new DataView(fewer.buffer).setUint16(fewer.length - 14, 2, true);
    expect(readZipDirectory(fewer, fewer.length)).toBeNull();
    const more = bytes.slice();
    new DataView(more.buffer).setUint16(more.length - 12, 4, true);
    new DataView(more.buffer).setUint16(more.length - 14, 4, true);
    expect(readZipDirectory(more, more.length)).toBeNull();
  });
  it('locates entry data after a local header', () => {
    const bytes = office('word/document.xml');
    expect(localDataOffset(bytes.subarray(0, 30))).toBe(30 + 19);
    expect(localDataOffset(bytes.subarray(0, 29))).toBeNull();
    expect(localDataOffset(ascii('%PDF-'.repeat(6)))).toBeNull();
  });
  it('requires the main content type and refuses macro-enabled manifests', () => {
    const manifest = (type: string) =>
      `<?xml version="1.0"?><Types><Override PartName="/word/document.xml" ContentType="${type}"/></Types>`;
    expect(
      officeManifestMatches(
        manifest(
          'application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml',
        ),
        docx,
      ),
    ).toBe(true);
    expect(
      officeManifestMatches(
        `<Override ContentType='application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml'/>`,
        xlsx,
      ),
    ).toBe(true);
    expect(
      officeManifestMatches(
        manifest('application/vnd.ms-word.document.macroEnabled.main+xml'),
        docx,
      ),
    ).toBe(false);
    expect(
      officeManifestMatches(
        manifest(
          'application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml',
        ) + '<Default ContentType="application/vnd.ms-office.macroEnabled"/>',
        docx,
      ),
    ).toBe(false);
    expect(
      officeManifestMatches(
        manifest(
          'application/vnd.openxmlformats-officedocument.presentationml.presentation.main+xml',
        ),
        docx,
      ),
    ).toBe(false);
    expect(
      officeManifestMatches(
        manifest(
          'applicationXvnd.openxmlformats-officedocument.presentationml.presentationXmain+xml',
        ),
        pptx,
      ),
    ).toBe(false);
  });
});
