import { SELF, env } from 'cloudflare:test';
import { beforeEach, expect, it } from 'vitest';
import type { SQL } from 'drizzle-orm';
import { PgDialect } from 'drizzle-orm/pg-core';
import type { openDatabase } from '@snapform/database';
import { MAX_UPLOAD_BYTES } from '@snapform/contracts/uploads';
import { handleIntakeFile, matchIntakeFileRoute } from '../src/intake-files.ts';
import { mutateIntake } from '@snapform/database/intake';
import type { Database } from '@snapform/database';
import { formFixture } from '../../../packages/contracts/test/form-fixture.ts';

// The real handler, R2 (miniflare) and checks run in workerd. The database stub
// stands in for Postgres and answers the migration 0046 functions.
const workspaceId = crypto.randomUUID(),
  formId = crypto.randomUUID(),
  publicId = crypto.randomUUID(),
  sessionId = crypto.randomUUID(),
  questionId = crypto.randomUUID();
const root = `http://127.0.0.1:5173/api/v1/public/forms/${publicId}/sessions/${sessionId}`;
const capability = 'b'.repeat(43);
const dialect = new PgDialect();
let outcomes: Record<string, unknown[] | Error> = {},
  calls: { sql: string; params: unknown[] }[] = [];
beforeEach(() => {
  outcomes = {
    authorize_intake_file: [
      { outcome: 'ok', file_workspace: workspaceId, file_form: formId },
    ],
    record_intake_file: [{ outcome: 'ok' }],
  };
  calls = [];
});
const db = {
  async execute(query: SQL) {
    const rendered = dialect.sqlToQuery(query);
    calls.push(rendered);
    const name = Object.keys(outcomes).find((item) =>
      rendered.sql.includes(item),
    );
    if (!name) throw Error('Unexpected query');
    const result = outcomes[name];
    if (result instanceof Error) throw result;
    return { rows: result };
  },
};
const open = (async () => ({
  db,
  close: async () => {},
})) as unknown as typeof openDatabase;
let address = 0;
const ip = () => `198.51.100.${(address++ % 200) + 1}`;
function call(request: Request) {
  const route = matchIntakeFileRoute(new URL(request.url).pathname);
  if (!route) throw Error('Expected a file route');
  return handleIntakeFile(request, route, {
    environment: { ...env, DATABASE_URL: 'postgres://stub.invalid/db' },
    open,
  });
}
function upload(
  body: Uint8Array<ArrayBuffer> | ReadableStream<Uint8Array>,
  type: string,
  name = 'Brief.pdf',
  headers: Record<string, string> = {},
) {
  return new Request(`${root}/questions/${questionId}/files`, {
    method: 'POST',
    headers: {
      Authorization: 'Bearer ' + capability,
      'Content-Type': type,
      'Content-Length': String(body instanceof Uint8Array ? body.length : 0),
      'X-File-Name': encodeURIComponent(name),
      'cf-connecting-ip': ip(),
      ...headers,
    },
    body,
  });
}
const ascii = (text: string) => new TextEncoder().encode(text);
const pdf = ascii('%PDF-1.7\n1 0 obj << >> endobj\n%%EOF\n');
const png = Uint8Array.of(
  0x89,
  0x50,
  0x4e,
  0x47,
  0x0d,
  0x0a,
  0x1a,
  0x0a,
  0,
  0,
  0,
  13,
);
async function stored() {
  const listed = await env.UPLOADS.list({ prefix: `${workspaceId}/` });
  return listed.objects.map((object) => object.key);
}
async function clear() {
  const keys = await stored();
  if (keys.length) await env.UPLOADS.delete(keys);
}
const recorded = () =>
  calls.filter((item) => item.sql.includes('record_intake_file'));

it('matches only UUID-scoped file routes and their methods', () => {
  const base = `/api/v1/public/forms/${publicId}/sessions/${sessionId}`;
  expect(matchIntakeFileRoute(`${base}/questions/${questionId}/files`)).toEqual(
    {
      publicId,
      sessionId,
      questionId,
      fileId: undefined,
      methods: ['POST'],
    },
  );
  expect(matchIntakeFileRoute(`${base}/files`)?.methods).toEqual(['GET']);
  expect(matchIntakeFileRoute(`${base}/files/${questionId}`)?.methods).toEqual([
    'DELETE',
  ]);
  for (const path of [
    `${base}/files/..%2F..%2Fsecret`,
    `${base}/files/${questionId}/x`,
    `${base}/questions/name.pdf/files`,
    `/api/v1/public/forms/${publicId}/sessions/../files`,
  ])
    expect(matchIntakeFileRoute(path)).toBeNull();
});
it('requires the respondent capability, not an account cookie or another origin', async () => {
  const request = (headers: Record<string, string>) =>
    SELF.fetch(`${root}/questions/${questionId}/files`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/pdf', ...headers },
      body: pdf,
    });
  const anonymous = await request({ Cookie: 'snapform.session_token=forged' });
  expect(anonymous.status).toBe(401);
  expect(anonymous.headers.get('Cache-Control')).toBe('no-store');
  expect(anonymous.headers.get('X-Content-Type-Options')).toBe('nosniff');
  expect(
    (
      await request({
        Authorization: 'Bearer ' + capability,
        Origin: 'https://evil.test',
      })
    ).status,
  ).toBe(403);
  expect((await SELF.fetch(`${root}/files`, { method: 'PUT' })).status).toBe(
    405,
  );
});
it('refuses unsupported types, missing lengths, empty and oversized files before any work', async () => {
  for (const [type, status] of [
    ['application/zip', 415],
    ['image/svg+xml', 415],
    ['text/html', 415],
    ['application/x-msdownload', 415],
    ['application/octet-stream', 415],
  ] as const)
    expect((await call(upload(pdf, type))).status).toBe(status);
  expect(
    (
      await call(
        upload(pdf, 'application/pdf', 'a.pdf', {
          'Content-Length': String(MAX_UPLOAD_BYTES + 1),
        }),
      )
    ).status,
  ).toBe(413);
  expect(
    (
      await call(
        upload(pdf, 'application/pdf', 'a.pdf', { 'Content-Length': '0' }),
      )
    ).status,
  ).toBe(422);
  expect(
    (
      await call(
        upload(pdf, 'application/pdf', 'a.pdf', { 'Content-Length': '1e3' }),
      )
    ).status,
  ).toBe(411);
  expect(
    (
      await call(
        upload(pdf, 'application/pdf', 'a.pdf', { 'X-File-Name': '%E0%A4%A' }),
      )
    ).status,
  ).toBe(422);
  expect(calls).toEqual([]);
  expect(await stored()).toEqual([]);
});
it('stores a verified file privately under a random key and records its digest', async () => {
  try {
    const response = await call(
      upload(pdf, 'application/pdf', '../../etc/invoice‮fdp.exe'),
    );
    expect(response.status).toBe(201);
    expect(response.headers.get('Cache-Control')).toBe('no-store');
    const { file } = (await response.json()) as {
      file: { id: string; name: string; size: number; type: string };
    };
    expect(file).toMatchObject({
      questionId,
      name: 'invoicefdp.exe.pdf',
      size: pdf.length,
      type: 'application/pdf',
    });
    const [key] = await stored();
    expect(key).toMatch(
      new RegExp(`^${workspaceId}/${formId}/${sessionId}/[A-Za-z0-9_-]{43}$`),
    );
    expect(key).not.toContain('invoice');
    const object = await env.UPLOADS.get(key);
    expect(new Uint8Array(await object!.arrayBuffer())).toEqual(pdf);
    expect(object?.httpMetadata?.contentDisposition).toBe('attachment');
    const digest = Array.from(
      new Uint8Array(await crypto.subtle.digest('SHA-256', pdf)),
      (byte) => byte.toString(16).padStart(2, '0'),
    ).join('');
    expect(recorded()[0].params).toEqual(
      expect.arrayContaining([file.id, questionId, key, file.name, digest]),
    );
  } finally {
    await clear();
  }
});
it('keeps unicode and right-to-left names readable without control characters', async () => {
  try {
    const response = await call(
      upload(ascii('name,city\nZoë,Pune\n'), 'text/csv', '⁧تقرير⁩ ✓.csv'),
    );
    expect(response.status).toBe(201);
    expect(
      ((await response.json()) as { file: { name: string } }).file.name,
    ).toBe('تقرير ✓.csv');
  } finally {
    await clear();
  }
});
it('refuses spoofed types, binary text and longer bodies without storing anything', async () => {
  const svg = ascii('<svg xmlns="http://www.w3.org/2000/svg"><script/></svg>');
  for (const [body, type, code] of [
    [png, 'application/pdf', 'FILE_TYPE_MISMATCH'],
    [pdf, 'image/png', 'FILE_TYPE_MISMATCH'],
    [svg, 'image/png', 'FILE_TYPE_MISMATCH'],
    [ascii('<html>%PDF-</html>'), 'application/pdf', 'FILE_TYPE_MISMATCH'],
    [
      Uint8Array.of(0x4d, 0x5a, 0x90, 0, 3, 0),
      'text/plain',
      'FILE_TYPE_MISMATCH',
    ],
    [Uint8Array.of(0x61, 0xc3, 0x28), 'text/csv', 'FILE_TYPE_MISMATCH'],
    [
      ascii('PK\x03\x04 not an office file'),
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'FILE_TYPE_MISMATCH',
    ],
  ] as const) {
    const response = await call(upload(body, type));
    expect(response.status).toBe(422);
    expect(await response.json()).toEqual({ error: { code } });
  }
  // The stream may not exceed the declared length, whatever the header says.
  const flood = new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(pdf);
      controller.enqueue(new Uint8Array(4096));
      controller.close();
    },
  });
  const oversized = await call(
    upload(flood, 'application/pdf', 'a.pdf', {
      'Content-Length': String(pdf.length),
    }),
  );
  expect(oversized.status).toBe(413);
  const short = await call(
    upload(pdf, 'application/pdf', 'a.pdf', {
      'Content-Length': String(pdf.length + 10),
    }),
  );
  expect(short.status).toBe(400);
  expect(recorded()).toEqual([]);
  expect(await stored()).toEqual([]);
});
it('maps a refused session, Free plan, wrong question and full question before storing', async () => {
  for (const [outcome, status] of [
    ['INTAKE_UNAVAILABLE', 404],
    ['UPLOADS_UNAVAILABLE', 403],
    ['FILE_QUESTION_UNAVAILABLE', 422],
    ['FILE_LIMIT_REACHED', 409],
    ['INTAKE_ALREADY_SUBMITTED', 409],
  ] as const) {
    outcomes.authorize_intake_file = [
      { outcome, file_workspace: null, file_form: null },
    ];
    const response = await call(upload(pdf, 'application/pdf'));
    expect(response.status).toBe(status);
    expect(await response.json()).toEqual({ error: { code: outcome } });
  }
  // An unknown outcome, even one named like an object property, fails closed.
  for (const outcome of ['SOMETHING_NEW', 'toString']) {
    outcomes.authorize_intake_file = [
      { outcome, file_workspace: null, file_form: null },
    ];
    const response = await call(upload(pdf, 'application/pdf'));
    expect(response.status).toBe(503);
  }
  expect(recorded()).toEqual([]);
  expect(await stored()).toEqual([]);
});
it('deletes the stored object when recording fails, as when a concurrent upload fills the question', async () => {
  outcomes.record_intake_file = [{ outcome: 'FILE_LIMIT_REACHED' }];
  expect((await call(upload(pdf, 'application/pdf'))).status).toBe(409);
  expect(await stored()).toEqual([]);
  outcomes.record_intake_file = Error('Database lost');
  expect((await call(upload(pdf, 'application/pdf'))).status).toBe(500);
  expect(await stored()).toEqual([]);
});
it('lists and removes only through the database answer for this capability', async () => {
  const fileId = crypto.randomUUID();
  outcomes = {
    list_intake_files: [
      {
        id: fileId,
        question_id: questionId,
        name: 'Brief.pdf',
        size: 10,
        content_type: 'application/pdf',
      },
    ],
  };
  const headers = {
    Authorization: 'Bearer ' + capability,
    'cf-connecting-ip': ip(),
  };
  const list = await call(new Request(`${root}/files`, { headers }));
  expect(await list.json()).toEqual({
    files: [
      {
        id: fileId,
        questionId,
        name: 'Brief.pdf',
        size: 10,
        type: 'application/pdf',
      },
    ],
  });
  outcomes = {
    list_intake_files: Error('Failed query', {
      cause: Error('INTAKE_UNAVAILABLE'),
    }),
  };
  expect((await call(new Request(`${root}/files`, { headers }))).status).toBe(
    404,
  );
  const key = `${workspaceId}/${formId}/${sessionId}/${'k'.repeat(43)}`;
  await env.UPLOADS.put(key, pdf);
  // Another session's file id: the database finds nothing to remove.
  outcomes = { remove_intake_file: [{ key: null }] };
  const remove = () =>
    call(new Request(`${root}/files/${fileId}`, { method: 'DELETE', headers }));
  expect((await remove()).status).toBe(404);
  expect(await stored()).toEqual([key]);
  outcomes = {
    remove_intake_file: Error('Failed query', {
      cause: Error('INTAKE_ALREADY_SUBMITTED'),
    }),
  };
  expect((await remove()).status).toBe(409);
  outcomes = { remove_intake_file: [{ key }] };
  expect((await remove()).status).toBe(204);
  expect(await stored()).toEqual([]);
});

// A real deflated Office package: manifest first, as Word writes it.
async function office(manifest: string, extra: string[] = []) {
  const deflate = async (text: string) =>
    new Uint8Array(
      await new Response(
        new Blob([text])
          .stream()
          .pipeThrough(new CompressionStream('deflate-raw')),
      ).arrayBuffer(),
    );
  const files = [
    {
      name: '[Content_Types].xml',
      data: await deflate(manifest),
      size: manifest.length,
      method: 8,
    },
    ...['_rels/.rels', 'word/document.xml', ...extra].map((name) => ({
      name,
      data: ascii('<x/>'),
      size: 4,
      method: 0,
    })),
  ];
  const local: number[] = [],
    directory: number[] = [];
  const u16 = (out: number[], v: number) => out.push(v & 0xff, v >> 8);
  const u32 = (out: number[], v: number) =>
    out.push(v & 0xff, (v >> 8) & 0xff, (v >> 16) & 0xff, v >>> 24);
  for (const file of files) {
    const name = ascii(file.name),
      offset = local.length;
    u32(local, 0x04034b50);
    [20, 0, file.method, 0, 0].forEach((v) => u16(local, v));
    [0, file.data.length, file.size].forEach((v) => u32(local, v));
    [name.length, 0].forEach((v) => u16(local, v));
    local.push(...name, ...file.data);
    u32(directory, 0x02014b50);
    [20, 20, 0, file.method, 0, 0].forEach((v) => u16(directory, v));
    [0, file.data.length, file.size].forEach((v) => u32(directory, v));
    [name.length, 0, 0, 0, 0].forEach((v) => u16(directory, v));
    [0, offset].forEach((v) => u32(directory, v));
    directory.push(...name);
  }
  const end: number[] = [];
  u32(end, 0x06054b50);
  [0, 0, files.length, files.length].forEach((v) => u16(end, v));
  [directory.length, local.length].forEach((v) => u32(end, v));
  u16(end, 0);
  return Uint8Array.from([...local, ...directory, ...end]);
}
const docx =
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
const types = (main: string) =>
  `<?xml version="1.0"?><Types><Override PartName="/word/document.xml" ContentType="${main}"/></Types>`;
it('reads an Office manifest back from R2 and refuses macro-enabled documents', async () => {
  try {
    const good = await office(
      types(
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml',
      ),
    );
    const accepted = await call(upload(good, docx, 'Proposal.docx'));
    expect(accepted.status).toBe(201);
    expect(await stored()).toHaveLength(1);
    await clear();
    for (const bytes of [
      await office(
        types('application/vnd.ms-word.document.macroEnabled.main+xml'),
      ),
      await office(
        types(
          'application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml',
        ),
        ['word/vbaProject.bin'],
      ),
    ]) {
      const refused = await call(upload(bytes, docx, 'Proposal.docx'));
      expect(refused.status).toBe(422);
      expect(await refused.json()).toEqual({
        error: { code: 'FILE_TYPE_MISMATCH' },
      });
    }
    expect(await stored()).toEqual([]);
    expect(recorded()).toHaveLength(1);
  } finally {
    await clear();
  }
});
it('turns a submission with another session’s file into a validation refusal', async () => {
  const { definition, ids } = formFixture();
  const question = crypto.randomUUID();
  definition.pages[0].blocks.push({
    id: question,
    type: 'file',
    label: 'Brief',
    description: '',
    required: true,
    aiEnabled: false,
    maxFiles: 1,
  });
  outcomes = {
    resume_intake_session: [
      {
        id: sessionId,
        publicId,
        versionId: crypto.randomUUID(),
        definition,
        revision: 1,
        answers: {},
        expiresAt: '2030-01-01T00:00:00.000Z',
        status: 'collecting',
      },
    ],
    // Migration 0046: the database owns the file-ownership check.
    write_intake_session: [
      {
        outcome: 'INTAKE_FILES_INVALID',
        revision: null,
        current_revision: null,
        status: null,
      },
    ],
  };
  const submit = (files: string[]) =>
    mutateIntake(
      db as unknown as Database,
      publicId,
      sessionId,
      'c'.repeat(64),
      'submit',
      {
        operationId: crypto.randomUUID(),
        expectedRevision: 1,
        answers: {
          [ids.budget]: { state: 'value', value: 0 },
          [ids.contact]: { state: 'value', value: 'qa@example.invalid' },
          [question]: { state: 'value', value: files },
        },
      },
    );
  await expect(submit([crypto.randomUUID()])).rejects.toMatchObject({
    message: 'INVALID_INTAKE_ANSWERS',
    issues: [expect.objectContaining({ code: 'FILE_REFERENCE_INVALID' })],
  });
  // Shared rules still refuse too many files and missing required files first.
  await expect(
    submit([crypto.randomUUID(), crypto.randomUUID()]),
  ).rejects.toMatchObject({ message: 'INVALID_INTAKE_ANSWERS' });
  await expect(submit([])).rejects.toMatchObject({
    message: 'INVALID_INTAKE_ANSWERS',
  });
  expect(
    calls.filter((item) => item.sql.includes('write_intake_session')),
  ).toHaveLength(1);
});
