import { test } from 'node:test';
import assert from 'node:assert/strict';
import { checkOperations, runCheck } from './check-operations.mjs';

const site = 'https://snapform.jacked.dev';
const healthy = () => ({
  [`${site}/`]: () =>
    new Response('page', { headers: { 'Content-Type': 'text/html' } }),
  [`${site}/api/v1/health`]: () => Response.json({ status: 'ok' }),
  [`${site}/api/v1/status`]: () =>
    Response.json({ status: 'ok', checkedAt: '2026-11-24T08:00:00.000Z' }),
});
function network(answers) {
  const calls = [];
  return {
    calls,
    waits: [],
    fetch: async (url, init) => {
      calls.push({ url, init });
      const answer = answers[url];
      if (!answer) throw Error('private diagnostic');
      return answer();
    },
  };
}
const check = (answers, net = network(answers)) =>
  checkOperations({ fetch: net.fetch, wait: async () => {} });

test('reads only three public pages that never open the database', async () => {
  const net = network(healthy());
  assert.deepEqual(await check(null, net), []);
  assert.deepEqual(
    net.calls.map((call) => call.url),
    Object.keys(healthy()),
  );
  for (const { init } of net.calls) {
    assert.equal(init.redirect, 'error');
    assert.equal(init.method ?? 'GET', 'GET');
    assert.equal(init.headers, undefined);
  }
});

test('names every part that stays broken after one retry', async () => {
  const bad = {
    website: [`${site}/`, () => new Response('challenge', { status: 403 })],
    api: [
      `${site}/api/v1/health`,
      () => Response.json({ error: {} }, { status: 500 }),
    ],
    jobs: [
      `${site}/api/v1/status`,
      () => Response.json({ status: 'stale' }, { status: 503 }),
    ],
  };
  for (const [name, [url, answer]] of Object.entries(bad)) {
    assert.deepEqual(await check({ ...healthy(), [url]: answer }), [name]);
    assert.deepEqual(await check({ ...healthy(), [url]: undefined }), [name]);
  }
  // A 200 with the wrong body is not a pass either.
  for (const url of Object.keys(healthy()))
    assert.equal(
      (
        await check({
          ...healthy(),
          [url]: () => Response.json({ status: 'failing' }),
        })
      ).length,
      1,
    );
  assert.deepEqual(await check({}), ['website', 'api', 'jobs']);
  let attempts = 0;
  assert.deepEqual(
    await check({
      ...healthy(),
      [`${site}/`]: () => {
        if (++attempts === 1) throw Error('private diagnostic');
        return healthy()[`${site}/`]();
      },
    }),
    [],
  );
  assert.equal(attempts, 2);
});

test('fails the run for an outage or a drill, with fixed output', async () => {
  for (const [failing, drill, code, text] of [
    [[], false, 0, 'operations_verified'],
    [[], true, 1, 'operations_alert_drill'],
    [['jobs'], false, 1, 'operations_failing'],
    // A drill never relabels a real outage.
    [['jobs'], true, 1, 'operations_failing'],
  ]) {
    const lines = [];
    assert.equal(
      await runCheck({
        check: async () => failing,
        drill,
        print: (line) => lines.push(line),
      }),
      code,
    );
    assert.ok(lines.join('\n').includes(text));
    assert.ok(!lines.join('\n').includes('private diagnostic'));
  }
});
