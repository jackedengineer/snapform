import { expect, it, vi } from 'vitest';
import { SELF } from 'cloudflare:test';
import { requestObservation } from '../src/request-observation.ts';
const id = '242c6529-f3d5-416d-a376-eca248b44478';
it('records bounded request timing and fixed route categories without private path data', () => {
  const result = requestObservation({
    requestId: id,
    method: 'POST',
    path: '/api/v1/workspaces/28765529-6337-4512-b148-f735ad07d28b/forms/d52dc924-855e-4e74-a2d3-f23d9f85119a/webhook/send',
    status: 202,
    durationMs: 234.56,
    completed: true,
  });
  expect(result).toEqual({
    event: 'http_request_completed',
    requestId: id,
    method: 'POST',
    route: 'webhook',
    status: 202,
    durationMs: 235,
    completed: true,
  });
  expect(JSON.stringify(result)).not.toContain('28765529');
});
it('never reflects unknown URLs, forged correlation values or methods into logs', () => {
  const result = requestObservation({
    requestId: 'secret-cookie',
    method: 'private-answer',
    path: '/unknown?token=capability',
    status: 0,
    durationMs: Infinity,
    completed: false,
  });
  expect(result).toEqual({
    event: 'http_request_completed',
    requestId: 'unavailable',
    method: 'OTHER',
    route: 'unknown',
    status: 500,
    durationMs: 0,
    completed: false,
  });
  expect(
    requestObservation({
      requestId: id,
      method: 'GET',
      path: '/api/v1/health/secret',
      status: 200,
      durationMs: -1,
      completed: true,
    }).route,
  ).toBe('unknown');
});
it('distinguishes completed responses from disconnects and handles known route families', () => {
  for (const [path, route] of [
    ['/api/v1/health', 'health'],
    ['/api/auth/sign-in/email', 'auth'],
    [
      '/api/v1/public/forms/242c6529-f3d5-416d-a376-eca248b44478',
      'public-form',
    ],
    ['/api/v1/workspaces', 'workspace'],
    ['/api/v1/public/intake-config', 'intake'],
    ['/api/v1/brief/review', 'brief'],
  ])
    expect(
      requestObservation({
        requestId: id,
        method: 'GET',
        path,
        status: 200,
        durationMs: 10,
        completed: false,
      }),
    ).toMatchObject({ route, completed: false });
});

it('correlates one real Worker response with one sanitized completion event', async () => {
  const log = vi.spyOn(console, 'log');
  try {
    const response = await SELF.fetch(
      'https://app.example.invalid/api/v1/health?token=synthetic-private-capability',
    );
    expect(response.status).toBe(200);
    await response.text();
    const events = log.mock.calls.flatMap(([value]) => {
      if (typeof value !== 'string') return [];
      try {
        const item = JSON.parse(value);
        return item.event === 'http_request_completed' ? [item] : [];
      } catch {
        return [];
      }
    });
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({
      requestId: response.headers.get('X-Request-Id'),
      route: 'health',
      status: 200,
      completed: true,
    });
    expect(JSON.stringify(events)).not.toContain(
      'synthetic-private-capability',
    );
  } finally {
    log.mockRestore();
  }
});

it('keeps concurrent response IDs independent and ignores supplied correlation headers', async () => {
  const log = vi.spyOn(console, 'log');
  try {
    const responses = await Promise.all([
      SELF.fetch('https://app.example.invalid/api/v1/health', {
        headers: { 'X-Request-Id': 'synthetic-session-token' },
      }),
      SELF.fetch(
        'https://app.example.invalid/unknown?answer=synthetic-private-answer',
      ),
    ]);
    await Promise.all(responses.map((response) => response.text()));
    const events = log.mock.calls.flatMap(([value]) => {
      if (typeof value !== 'string') return [];
      try {
        const event = JSON.parse(value);
        return event.event === 'http_request_completed' ? [event] : [];
      } catch {
        return [];
      }
    });
    expect(responses.map((response) => response.status)).toEqual([200, 404]);
    expect(events).toHaveLength(2);
    expect(new Set(events.map((event) => event.requestId)).size).toBe(2);
    expect(events.map((event) => event.requestId).sort()).toEqual(
      responses.map((response) => response.headers.get('X-Request-Id')).sort(),
    );
    expect(JSON.stringify(events)).not.toContain('synthetic-session-token');
    expect(JSON.stringify(events)).not.toContain('synthetic-private-answer');
  } finally {
    log.mockRestore();
  }
});
