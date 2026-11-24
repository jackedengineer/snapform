import { z } from './zod.ts';

// What the operator can be told about. `alerts` means alert emails cannot be
// sent; `drill` is a deliberate test of the whole path.
const check = z.enum(['website', 'forms', 'jobs', 'alerts', 'drill']);
export type OperationsCheck = z.infer<typeof check>;
const checks = z.array(check).check(z.maxLength(5));
const time = z.iso.datetime();
const count = z.int().check(z.minimum(0));

export const operationsStateSchema = z.strictObject({
  checkedAt: time,
  failing: checks,
  incident: z.nullable(
    z.strictObject({
      since: time,
      // Failed runs so far, and clean runs in a row since the last failure.
      runs: count,
      clean: count,
      // Checks the operator must hear about, and those already emailed.
      confirmed: checks,
      notified: checks,
      notifiedAt: z.nullable(time),
    }),
  ),
});
export type OperationsState = z.infer<typeof operationsStateSchema>;
export type OperationsNotice = 'failing' | 'recovered';

const hour = 3_600_000;
const reminderAfter = 24 * hour;
// Jobs runs every 30 minutes: two missed runs and some slack.
const staleAfter = 75 * 60_000;

// One email when something breaks, one a day while it lasts and one when it is
// over. An incident ends after two clean runs in a row, so a part that comes
// and goes stays one incident instead of an email every half hour.
export function nextOperations(
  previous: OperationsState | null,
  failing: OperationsCheck[],
  now: Date,
): { state: OperationsState; notice: OperationsNotice | null } {
  const checkedAt = now.toISOString();
  const open = previous?.incident ?? null;
  if (!failing.length) {
    if (!open) return done(null);
    const incident = { ...open, clean: open.clean + 1 };
    if (incident.clean < 2) return done(incident);
    return incident.confirmed.length ? done(incident, 'recovered') : done(null);
  }
  const incident = open
    ? { ...open, runs: open.runs + 1, clean: 0 }
    : {
        since: checkedAt,
        runs: 1,
        clean: 0,
        confirmed: [],
        notified: [],
        notifiedAt: null,
      };
  // The next run repeats a failed jobs run and nothing is lost in between, so
  // one blip is not worth an email. The other checks were already retried.
  incident.confirmed = check.options.filter(
    (item) =>
      incident.confirmed.includes(item) ||
      (failing.includes(item) && (item !== 'jobs' || incident.runs > 1)),
  );
  const unheard = incident.confirmed.length > incident.notified.length;
  const reminder =
    incident.notifiedAt !== null &&
    now.getTime() - Date.parse(incident.notifiedAt) >= reminderAfter;
  return done(incident, unheard || reminder ? 'failing' : null);

  function done(
    incident: OperationsState['incident'],
    notice: OperationsNotice | null = null,
  ) {
    return { state: { checkedAt, failing, incident }, notice };
  }
}

/** Records an accepted email, so it is not repeated. */
export function noticeSent(
  state: OperationsState,
  notice: OperationsNotice,
  now: Date,
): OperationsState {
  if (notice === 'recovered' || !state.incident)
    return { ...state, incident: null };
  return {
    ...state,
    incident: {
      ...state.incident,
      notified: state.incident.confirmed,
      notifiedAt: now.toISOString(),
    },
  };
}

/** What an outside check sees. Anything but `ok` deserves attention. */
export function operationsStatus(state: OperationsState | null, now: Date) {
  if (!state) return { status: 'unknown' as const };
  const { checkedAt, incident } = state;
  const age = now.getTime() - Date.parse(checkedAt);
  if (age > staleAfter || age < -5 * 60_000)
    return { status: 'stale' as const, checkedAt };
  const failing = state.failing.filter((item) =>
    incident?.confirmed.includes(item),
  );
  return failing.length
    ? { status: 'failing' as const, checkedAt, failing }
    : { status: 'ok' as const, checkedAt };
}
