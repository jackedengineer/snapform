import { expect, it } from 'vitest';
import {
  nextOperations,
  noticeSent,
  operationsStateSchema,
  operationsStatus,
} from '../src/operations';
import type { OperationsCheck, OperationsState } from '../src/operations';

const start = Date.parse('2026-11-24T08:00:00.000Z');
const run = (index: number) => new Date(start + index * 30 * 60_000);
// Runs the checks every 30 minutes; a notice counts as sent unless told not to.
function play(
  runs: OperationsCheck[][],
  delivered: (index: number) => boolean = () => true,
) {
  let state: OperationsState | null = null;
  const notices: string[] = [];
  runs.forEach((failing, index) => {
    const next = nextOperations(state, failing, run(index));
    state = next.state;
    if (next.notice && delivered(index)) {
      notices.push(`${index}:${next.notice}`);
      state = noticeSent(next.state, next.notice, run(index));
    }
    expect(operationsStateSchema.parse(state)).toEqual(state);
  });
  return { notices, state: state as OperationsState | null };
}

it('says nothing while every check passes', () => {
  const { notices, state } = play([[], [], []]);
  expect(notices).toEqual([]);
  expect(state).toEqual({
    checkedAt: run(2).toISOString(),
    failing: [],
    incident: null,
  });
});

it('reports a broken site or form at once, then once a day, then its recovery', () => {
  for (const check of ['website', 'forms', 'alerts', 'drill'] as const)
    expect(play([[check]]).notices).toEqual(['0:failing']);
  // Down for 25 hours, then healthy: one alert, one reminder, one recovery.
  const down = Array.from({ length: 50 }, () => ['website' as const]);
  const { notices, state } = play([...down, [], [], []]);
  expect(notices).toEqual(['0:failing', '48:failing', '51:recovered']);
  expect(state?.incident).toBeNull();
});

it('waits for a second failed jobs run, because the next run repeats the work', () => {
  expect(play([['jobs'], [], [], []]).notices).toEqual([]);
  expect(play([['jobs'], ['jobs'], [], []]).notices).toEqual([
    '1:failing',
    '3:recovered',
  ]);
  // Failing every other run never looks healthy twice, so it is still reported.
  expect(play([['jobs'], [], ['jobs'], [], ['jobs']]).notices).toEqual([
    '2:failing',
  ]);
});

it('reports a part that breaks later and stays quiet while parts flap', () => {
  expect(
    play([['website'], ['website', 'forms'], ['website'], ['forms'], []])
      .notices,
  ).toEqual(['0:failing', '1:failing']);
});

it('keeps trying until a notice is accepted', () => {
  expect(
    play([['forms'], ['forms'], ['forms'], [], []], (index) => index >= 2)
      .notices,
  ).toEqual(['2:failing', '4:recovered']);
  // The site healed before any email got out, so its end is still reported.
  expect(
    play([['forms'], [], [], [], []], (index) => index >= 3).notices,
  ).toEqual(['3:recovered']);
});

it('shows a confirmed failure, a silent schedule and a missing first run', () => {
  const at = (minutes: number) => new Date(start + minutes * 60_000);
  expect(operationsStatus(null, at(0))).toEqual({ status: 'unknown' });
  const healthy = play([[]]).state;
  expect(operationsStatus(healthy, at(74))).toEqual({
    status: 'ok',
    checkedAt: run(0).toISOString(),
  });
  // Two missed runs and some slack, or a clock that cannot be trusted.
  for (const minutes of [76, -10])
    expect(operationsStatus(healthy, at(minutes))).toEqual({
      status: 'stale',
      checkedAt: run(0).toISOString(),
    });
  expect(operationsStatus(play([['forms', 'jobs']]).state, at(1))).toEqual({
    status: 'failing',
    checkedAt: run(0).toISOString(),
    failing: ['forms'],
  });
  // One unconfirmed jobs failure is not reported anywhere.
  expect(operationsStatus(play([['jobs']]).state, at(1)).status).toBe('ok');
  // Recovered: the page is green again before the recovery email is due.
  expect(operationsStatus(play([['forms'], []]).state, at(31)).status).toBe(
    'ok',
  );
});

it('accepts only its own stored shape', () => {
  for (const value of [
    null,
    {},
    { checkedAt: 'yesterday', failing: [], incident: null },
    { checkedAt: run(0).toISOString(), failing: ['database'], incident: null },
    { checkedAt: run(0).toISOString(), failing: [], incident: {} },
    { checkedAt: run(0).toISOString(), failing: [], incident: null, extra: 1 },
  ])
    expect(operationsStateSchema.safeParse(value).success).toBe(false);
});
