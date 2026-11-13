import { describe, expect, it } from 'vitest';
import {
  MAX_UPLOAD_BYTES,
  formatFileSize,
  hasFileQuestion,
  isUploadType,
  uploadAccept,
  uploadTypeFor,
  uploadTypes,
  uploadedFileSchema,
  uploadedFilesSchema,
} from './uploads.ts';

describe('upload allow-list', () => {
  it('allows exactly the decided ten types, 25 MB each', () => {
    expect(Object.keys(uploadTypes)).toHaveLength(10);
    expect(MAX_UPLOAD_BYTES).toBe(26214400);
    for (const type of ['application/pdf', 'text/csv', 'image/webp'])
      expect(isUploadType(type)).toBe(true);
    for (const type of [
      'application/zip',
      'image/svg+xml',
      'text/html',
      'application/x-msdownload',
      'application/vnd.ms-word.document.macroEnabled.12',
      'toString',
      42,
    ])
      expect(isUploadType(type)).toBe(false);
  });
  it('offers extensions and image types to the native picker', () => {
    expect(uploadAccept.split(',')).toEqual([
      '.pdf',
      '.png',
      '.jpg',
      '.jpeg',
      '.webp',
      '.gif',
      '.docx',
      '.xlsx',
      '.pptx',
      '.txt',
      '.csv',
      'image/png',
      'image/jpeg',
      'image/webp',
      'image/gif',
    ]);
  });
  it('declares a type from the extension and a consistent browser report', () => {
    expect(uploadTypeFor('Brief.PDF', 'application/pdf')).toBe(
      'application/pdf',
    );
    expect(uploadTypeFor('photo.jpeg', 'image/pjpeg')).toBe('image/jpeg');
    expect(uploadTypeFor('IMG_1.jpg', '')).toBe('image/jpeg');
    // Windows with Excel installed reports CSV files as Excel workbooks.
    expect(uploadTypeFor('leads.csv', 'application/vnd.ms-excel')).toBe(
      'text/csv',
    );
    expect(uploadTypeFor('notes.txt', 'text/plain; charset=utf-8')).toBe(
      'text/plain',
    );
    expect(uploadTypeFor('plan.docx', 'application/octet-stream')).toBe(
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    );
  });
  it('refuses unknown extensions and contradicting browser types', () => {
    for (const [name, type] of [
      ['archive.zip', 'application/zip'],
      ['logo.svg', 'image/svg+xml'],
      ['page.html', 'text/html'],
      ['setup.exe', ''],
      ['macro.docm', ''],
      ['README', 'text/plain'],
      ['invoice.pdf', 'text/html'],
      ['photo.png', 'image/jpeg'],
      ['notes.txt', 'application/vnd.ms-excel'],
    ])
      expect(uploadTypeFor(name, type)).toBeNull();
  });
});

describe('uploaded file metadata', () => {
  const file = {
    id: crypto.randomUUID(),
    questionId: crypto.randomUUID(),
    name: 'Brief.pdf',
    size: 1024,
    type: 'application/pdf',
  };
  it('describes a stored file without its key, hash or bytes', () => {
    expect(uploadedFileSchema.parse(file)).toEqual(file);
    for (const change of [
      { name: '' },
      { name: 'x'.repeat(201) },
      { name: 'bad\0name.pdf' },
      { size: 0 },
      { size: MAX_UPLOAD_BYTES + 1 },
      { type: 'application/zip' },
      { key: 'a/b/c/d' },
    ])
      expect(uploadedFileSchema.safeParse({ ...file, ...change }).success).toBe(
        false,
      );
    expect(uploadedFilesSchema.safeParse(Array(151).fill(file)).success).toBe(
      false,
    );
  });
  it('formats sizes for people', () => {
    expect(formatFileSize(1)).toBe('1 byte');
    expect(formatFileSize(900)).toBe('900 bytes');
    expect(formatFileSize(1536)).toBe('1.5 KB');
    expect(formatFileSize(MAX_UPLOAD_BYTES)).toBe('25 MB');
  });
  it('finds file questions on any page', () => {
    expect(hasFileQuestion({ pages: [{ blocks: [{ type: 'email' }] }] })).toBe(
      false,
    );
    expect(
      hasFileQuestion({
        pages: [{ blocks: [] }, { blocks: [{ type: 'file' }] }],
      }),
    ).toBe(true);
  });
});
