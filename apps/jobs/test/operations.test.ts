import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { createScheduledController, env } from 'cloudflare:test';
import { openDatabase } from '@snapform/database';
import type { Database } from '@snapform/database';
import { claimResponseEvents } from '@snapform/database/outbox';
import worker from '../src/worker';
vi.mock('@snapform/database', () => ({ openDatabase: vi.fn() }));
vi.mock('@snapform/database/outbox', () => ({
  claimResponseEvents: vi.fn(async () => []),
  recordResponseDispatch: vi.fn(),
  acknowledgeResponseEvent: vi.fn(),
}));
vi.mock('@snapform/database/notification-delivery', () => ({
  claimOwnerEmails: vi.fn(async () => []),
  prepareOwnerEmail: vi.fn(),
  recordOwnerEmail: vi.fn(),
  recordOwnerProviderStatus: vi.fn(),
}));
vi.mock('@snapform/database/webhook-attempts', () => ({
  claimWebhooks: vi.fn(async () => []),
  prepareWebhookPayload: vi.fn(),
  recordWebhookAttempt: vi.fn(),
}));
const configuration = {
  ...env,
  DATABASE_URL: 'postgresql://snapform_jobs@localhost/snapform',
  OPERATIONS_ENABLED: '1',
  OPERATIONS_ALERT_EMAIL: 'operator@example.invalid',
  RESEND_API_KEY: 'synthetic-key',
};
const site = 'https://snapform.jacked.dev';
const form = `${site}/api/v1/public/forms/00000000-0000-4000-8000-000000000000`;
const page = () =>
  new Response('<!doctype html>', {
    headers: { 'Content-Type': 'text/html; charset=utf-8' },
  });
const noForm = () =>
  Response.json({ error: { code: 'FORM_UNAVAILABLE' } }, { status: 404 });
const accepted = () => Response.json({ id: crypto.randomUUID() });
// Real Request construction, so workerd rejects options it does not support.
let calls: Request[] = [];
let answers: Record<string, () => Response | Promise<Response>> = {};
const emails = async () =>
  Promise.all(
    calls
      .filter((request) => request.url === 'https://api.resend.com/emails')
      .map(async (request) => ({
        key: request.headers.get('Idempotency-Key'),
        ...((await request.clone().json()) as {
          from: string;
          to: string[];
          subject: string;
          text: string;
        }),
      })),
  );
const logs = vi.spyOn(console, 'error');
const start = Date.parse('2026-11-24T08:00:00.000Z');
let clock = start;
async function sweep(overrides: Record<string, unknown> = {}) {
  calls = [];
  try {
    await worker.scheduled(createScheduledController(), {
      ...configuration,
      ...overrides,
    });
    return 'ok';
  } catch (error) {
    return (error as Error).message;
  } finally {
    clock += 30 * 60_000;
    vi.setSystemTime(clock);
  }
}
const status = (init?: RequestInit, overrides = {}) =>
  worker.fetch(
    new Request(`${site}/api/v1/status`, init) as Request<
      unknown,
      IncomingRequestCfProperties
    >,
    { ...configuration, ...overrides },
  );
beforeEach(async () => {
  clock = start;
  vi.useFakeTimers({ toFake: ['Date'], now: clock });
  vi.mocked(openDatabase).mockResolvedValue({
    db: {} as Database,
    close: async () => {},
  });
  logs.mockReset();
  // The real wait between two probe attempts, without spending it in a test.
  vi.spyOn(scheduler, 'wait').mockResolvedValue(undefined);
  answers = {
    [`${site}/`]: page,
    [form]: noForm,
    'https://api.resend.com/emails': accepted,
  };
  vi.stubGlobal('fetch', async (input: string, init?: RequestInit) => {
    const request = new Request(input, init);
    calls.push(request);
    const answer = answers[request.url];
    if (!answer) throw Error('private diagnostic');
    return answer();
  });
  await env.OPERATIONS.delete('status.json');
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.mocked(scheduler.wait).mockRestore();
});

it('checks the public site and a form read after the sweep and stays quiet', async () => {
  expect(await sweep()).toBe('ok');
  expect(calls.map((request) => request.url)).toEqual([`${site}/`, form]);
  expect(calls.every((request) => request.method === 'GET')).toBe(true);
  expect(await emails()).toEqual([]);
  const response = await status();
  expect(response.status).toBe(200);
  expect(response.headers.get('Cache-Control')).toBe('no-store');
  expect(await response.json()).toEqual({
    status: 'ok',
    checkedAt: '2026-11-24T08:00:00.000Z',
  });
});

it('does nothing at all until it is switched on', async () => {
  for (const OPERATIONS_ENABLED of [undefined, '0', 'true']) {
    expect(await sweep({ OPERATIONS_ENABLED })).toBe('ok');
    expect(calls).toEqual([]);
    expect((await status(undefined, { OPERATIONS_ENABLED })).status).toBe(404);
  }
  expect(await env.OPERATIONS.head('status.json')).toBeNull();
});

it('emails once when the database is down, reminds daily and reports recovery', async () => {
  vi.mocked(openDatabase).mockRejectedValue(Error('private diagnostic'));
  answers[form] = () =>
    Response.json({ error: { code: 'INTERNAL_ERROR' } }, { status: 500 });
  // The run still fails, so Cloudflare keeps counting it as an error.
  expect(await sweep()).toBe('Response jobs failed');
  const [first, ...more] = await emails();
  expect(more).toEqual([]);
  expect(first).toMatchObject({
    from: 'Snapform <no-reply@jacked.dev>',
    to: ['operator@example.invalid'],
    subject: '[Snapform] Problem: forms',
  });
  expect(first.text).toContain('Forms: ');
  expect(first.text).toContain('24 Nov 2026, 13:30 IST (08:00 UTC)');
  expect(first.text).toContain('/docs/runbooks/alerts.md');
  // The second failed run confirms the background jobs; after that, silence.
  expect(await sweep()).toBe('Response jobs failed');
  expect((await emails()).map((email) => email.subject)).toEqual([
    '[Snapform] Problem: forms, background jobs',
  ]);
  expect(await sweep()).toBe('Response jobs failed');
  expect(await emails()).toEqual([]);
  const failing = await status();
  expect(failing.status).toBe(503);
  expect(await failing.json()).toMatchObject({
    status: 'failing',
    failing: ['forms', 'jobs'],
  });
  clock += 24 * 3_600_000;
  vi.setSystemTime(clock);
  await sweep();
  expect((await emails()).map((email) => email.subject)).toEqual([
    '[Snapform] Still failing: forms, background jobs',
  ]);
  vi.mocked(openDatabase).mockResolvedValue({
    db: {} as Database,
    close: async () => {},
  });
  answers[form] = noForm;
  expect(await sweep()).toBe('ok');
  expect(await emails()).toEqual([]);
  expect((await status()).status).toBe(200);
  expect(await sweep()).toBe('ok');
  const [recovered] = await emails();
  expect(recovered.subject).toBe('[Snapform] Back to normal');
  expect(recovered.text).toContain('24 Nov 2026, 13:30 IST (08:00 UTC)');
  expect(await sweep()).toBe('ok');
  expect(await emails()).toEqual([]);
});

it('tries a failed check twice and treats any unexpected answer as a failure', async () => {
  let attempts = 0;
  answers[`${site}/`] = () =>
    ++attempts === 1 ? new Response(null, { status: 503 }) : page();
  await sweep();
  expect(attempts).toBe(2);
  expect(await emails()).toEqual([]);
  for (const answer of [
    () => new Response('gone', { status: 200 }),
    () => new Response(null, { status: 302, headers: { Location: '/login' } }),
    () => Promise.reject(Error('private diagnostic')),
  ]) {
    await env.OPERATIONS.delete('status.json');
    answers[`${site}/`] = answer;
    await sweep();
    expect((await emails()).map((email) => email.subject)).toEqual([
      '[Snapform] Problem: website',
    ]);
  }
  answers[`${site}/`] = page;
  for (const answer of [
    () => Response.json({ form: {} }),
    () => Response.json({ error: { code: 'NOT_FOUND' } }, { status: 404 }),
    () => new Response('not json', { status: 404 }),
    () =>
      Response.json({ error: { code: 'FORM_UNAVAILABLE' } }, { status: 503 }),
  ]) {
    await env.OPERATIONS.delete('status.json');
    answers[form] = answer;
    await sweep();
    expect((await emails()).map((email) => email.subject)).toEqual([
      '[Snapform] Problem: forms',
    ]);
  }
});

it('repeats an unaccepted email with the same key and never reports it as sent', async () => {
  answers[form] = () => new Response(null, { status: 500 });
  const keys: (string | null)[] = [];
  for (const answer of [
    () => Response.json({ message: 'private diagnostic' }, { status: 401 }),
    () => Response.json({ id: 'not-an-id' }),
    () => new Response('x'.repeat(9000)),
    () => Promise.reject(Error('private diagnostic')),
    accepted,
  ]) {
    answers['https://api.resend.com/emails'] = answer;
    await sweep();
    const [email] = await emails();
    keys.push(email.key);
  }
  expect(new Set(keys).size).toBe(1);
  expect(keys[0]).toMatch(/^operations-v1-/);
  expect(logs.mock.calls.flat()).toContain(
    JSON.stringify({ event: 'operations_alert_failed' }),
  );
  await sweep();
  expect(await emails()).toEqual([]);
});

it('turns missing alert settings into a visible failure instead of a silent one', async () => {
  for (const setting of [
    { OPERATIONS_ALERT_EMAIL: undefined },
    { OPERATIONS_ALERT_EMAIL: 'a@example.invalid\r\nBcc: b@example.invalid' },
    { RESEND_API_KEY: '' },
    { EMAIL_FROM: '' },
  ]) {
    await env.OPERATIONS.delete('status.json');
    expect(await sweep(setting)).toBe('ok');
    expect(await emails()).toEqual([]);
    expect((await status()).status).toBe(503);
  }
});

it('runs a labelled drill through the same path', async () => {
  expect(await sweep({ OPERATIONS_ENABLED: 'drill' })).toBe('ok');
  const [drill] = await emails();
  expect(drill.subject).toBe('[Snapform drill] Test alert');
  expect(drill.text).toContain('Nothing is broken');
  expect(await sweep()).toBe('ok');
  expect(await sweep()).toBe('ok');
  expect((await emails()).map((email) => email.subject)).toEqual([
    '[Snapform] Back to normal',
  ]);
  // A drill never hides a real failure.
  answers[form] = () => new Response(null, { status: 500 });
  await sweep({ OPERATIONS_ENABLED: 'drill' });
  expect((await emails())[0].subject).toBe('[Snapform] Problem: forms, drill');
});

it('never fails a healthy sweep or hides a failed one when the status store is down', async () => {
  const OPERATIONS = {
    get: async () => {
      throw Error('private diagnostic');
    },
  } as unknown as R2Bucket;
  for (const broken of [{ OPERATIONS }, { OPERATIONS: undefined }]) {
    expect(await sweep(broken)).toBe('ok');
    vi.mocked(claimResponseEvents).mockRejectedValueOnce(Error('private'));
    expect(await sweep(broken)).toBe('Response jobs failed');
    expect(await emails()).toEqual([]);
    const response = await status(undefined, broken);
    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({ status: 'unknown' });
  }
  expect(logs.mock.calls.flat()).toContain(
    JSON.stringify({ event: 'operations_report_failed' }),
  );
  expect(JSON.stringify(logs.mock.calls)).not.toContain('private');
});

it('starts over from an unreadable status and goes stale when the schedule stops', async () => {
  for (const stored of ['{', '{"status":"ok"}', 'x'.repeat(5000)]) {
    await env.OPERATIONS.put('status.json', stored);
    expect((await status()).status).toBe(503);
    expect(await sweep()).toBe('ok');
    expect((await status()).status).toBe(200);
  }
  clock += 3_600_000;
  vi.setSystemTime(clock);
  const stale = await status();
  expect(stale.status).toBe(503);
  expect(await stale.json()).toMatchObject({ status: 'stale' });
});

it('answers only reads on the status route', async () => {
  await sweep();
  const head = await status({ method: 'HEAD' });
  expect(head.status).toBe(200);
  expect(await head.text()).toBe('');
  for (const method of ['POST', 'PUT', 'DELETE']) {
    const response = await status({ method });
    expect(response.status).toBe(405);
    expect(response.headers.get('Allow')).toBe('GET, HEAD');
  }
});
