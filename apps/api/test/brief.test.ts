import { SELF } from 'cloudflare:test';
import { describe, expect, it } from 'vitest';

const valid = {
  goal: 'A website that explains our services.',
  budget: 7500,
  currency: 'USD',
  targetDate: '2027-01-15',
};
const post = (body: unknown, headers: Record<string, string> = {}) =>
  SELF.fetch('https://snapform.test/api/v1/brief/review', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...headers },
    body: JSON.stringify(body),
  });

describe('Express Worker brief review', () => {
  it('returns only a checked brief and never claims to save it', async () => {
    const response = await post(valid);
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ brief: valid });
    expect(response.headers.get('Cache-Control')).toBe('no-store');
    expect(response.headers.get('X-Content-Type-Options')).toBe('nosniff');
    expect(response.headers.get('X-Powered-By')).toBeNull();
    expect(response.headers.get('X-Request-Id')).toMatch(/^[0-9a-f-]{36}$/);
  });
  it('preserves zero and explicit units', async () => {
    const response = await post({ ...valid, budget: 0, currency: 'INR' });
    expect(await response.json()).toEqual({
      brief: { ...valid, budget: 0, currency: 'INR' },
    });
  });
  it.each([
    { ...valid, budget: -1 },
    { ...valid, workspaceId: 'forged' },
    { ...valid, targetDate: '2027-02-30' },
    {},
  ])('rejects bypassed client validation', async (body) => {
    const response = await post(body);
    expect(response.status).toBe(422);
    expect(await response.json()).toMatchObject({
      error: { code: 'INVALID_BRIEF' },
    });
  });
  it('treats markup as data and uses JSON content type', async () => {
    const goal = '<img src=x onerror=alert("synthetic")> A useful project.';
    const response = await post({ ...valid, goal });
    expect(response.headers.get('Content-Type')).toContain('application/json');
    expect(await response.json()).toEqual({ brief: { ...valid, goal } });
  });
  it('rejects malformed JSON without exposing parser diagnostics or content', async () => {
    const response = await SELF.fetch(
      'https://snapform.test/api/v1/brief/review',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: '{"goal":"synthetic-private-value",',
      },
    );
    expect(response.status).toBe(400);
    expect(await response.text()).not.toContain('synthetic-private-value');
  });
  it('rejects oversized bodies', async () => {
    const response = await post({ ...valid, goal: 'x'.repeat(10_000) });
    expect(response.status).toBe(413);
  });
  it('requires JSON rather than accepting alternate body encodings', async () => {
    const response = await SELF.fetch(
      'https://snapform.test/api/v1/brief/review',
      {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain' },
        body: 'synthetic',
      },
    );
    expect(response.status).toBe(415);
  });
  it('rejects a cross-origin browser request', async () => {
    const response = await post(valid, { Origin: 'https://attacker.test' });
    expect(response.status).toBe(403);
    expect(response.headers.get('Access-Control-Allow-Origin')).toBeNull();
  });
  it('rejects an opaque browser origin and cross-site fetch metadata', async () => {
    expect((await post(valid, { Origin: 'null' })).status).toBe(403);
    expect((await post(valid, { 'Sec-Fetch-Site': 'cross-site' })).status).toBe(
      403,
    );
  });
  it('accepts a same-origin browser request', async () => {
    expect(
      (await post(valid, { Origin: 'https://snapform.test' })).status,
    ).toBe(200);
  });
  it('does not expose unimplemented private routes or reflect an attacker URL', async () => {
    const response = await SELF.fetch(
      'https://snapform.test/api/v1/responses?probe=synthetic-private-value',
    );
    expect(response.status).toBe(404);
    expect(await response.text()).not.toContain('synthetic-private-value');
  });
  it('handles repeated validation without manufacturing response identities', async () => {
    const results = await Promise.all([post(valid), post(valid), post(valid)]);
    for (const response of results)
      expect(await response.json()).toEqual({ brief: valid });
  });
});
