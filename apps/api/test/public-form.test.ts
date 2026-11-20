import { SELF, env } from 'cloudflare:test';
import { expect, it } from 'vitest';
import { publicFormEnvelopeSchema } from '@snapform/contracts/public-form';
import { matchPublicFormRoute, publicFormBody } from '../src/public-form.ts';
import { formFixture } from '../../../packages/contracts/test/form-fixture.ts';
import { sendWhileFull } from './rate-limit.ts';
const id = crypto.randomUUID(),
  path = `/api/v1/public/forms/${id}`;
const url = `http://127.0.0.1:5173${path}`;
it('recognizes only an exact public identity without accepting private scopes', () => {
  expect(matchPublicFormRoute(path)).toBe(id);
  expect(matchPublicFormRoute(path + '/')).toBeNull();
  expect(matchPublicFormRoute(path.replace(id, 'unknown'))).toBeNull();
});
it('names the business in the public envelope and nothing else about it', () => {
  const { definition } = formFixture();
  const record = {
    publicId: id,
    versionId: crypto.randomUUID(),
    definition,
    businessName: '  Studio North  ',
    plan: null,
  };
  const body = publicFormBody(record, definition);
  expect(body).toEqual({
    form: {
      publicId: id,
      versionId: record.versionId,
      definition,
      business: { name: 'Studio North' },
    },
  });
  expect(JSON.stringify(body)).not.toContain('businessName');
  expect(
    publicFormEnvelopeSchema.parse(JSON.parse(JSON.stringify(body))),
  ).toEqual(body);
  for (const businessName of [null, '', '   ', 'x'.repeat(81)]) {
    const older = publicFormBody({ ...record, businessName }, definition);
    expect(older.form).not.toHaveProperty('business');
    expect(Object.keys(older.form)).toEqual([
      'publicId',
      'versionId',
      'definition',
    ]);
  }
});
it('turns the workspace plan into badge and embed flags and never names the plan', () => {
  const { definition } = formFixture();
  const record = {
    publicId: id,
    versionId: crypto.randomUUID(),
    definition,
    businessName: null,
  };
  for (const [plan, flags] of [
    ['free', { badge: true, embed: false }],
    ['pro', { badge: false, embed: true }],
  ] as const) {
    const body = publicFormBody({ ...record, plan }, definition);
    expect(body.form.plan).toEqual(flags);
    expect(JSON.stringify(body)).not.toMatch(/"(free|pro)"/);
    expect(
      publicFormEnvelopeSchema.parse(JSON.parse(JSON.stringify(body))),
    ).toEqual(body);
  }
  // Before migration 0045, or with an unexpected value, the flags are left
  // out and the collector keeps its earlier behaviour.
  for (const plan of [null, 'enterprise', ''])
    expect(
      publicFormBody({ ...record, plan }, definition).form,
    ).not.toHaveProperty('plan');
});
it('returns an uncached missing form without requiring account authentication', async () => {
  const response = await SELF.fetch(url);
  expect(response.status).toBe(404);
  expect(response.headers.get('Cache-Control')).toBe('no-store');
  expect(await response.json()).toEqual({
    error: { code: 'FORM_UNAVAILABLE' },
  });
  const wrongMethod = await SELF.fetch(url, { method: 'POST' });
  expect(wrongMethod.status).toBe(405);
  expect(wrongMethod.headers.get('Allow')).toBe('GET');
});
it('enforces the native public read limit before opening a database', async () => {
  const key = '198.51.100.42';
  const response = await sendWhileFull(env.PUBLIC_READ_RATE_LIMIT, key, () =>
    SELF.fetch(url, { headers: { 'cf-connecting-ip': key } }),
  );
  expect(response.status).toBe(429);
  expect(response.headers.get('Retry-After')).toBe('60');
});
