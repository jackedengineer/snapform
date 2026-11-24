import {
  nextOperations,
  noticeSent,
  operationsStateSchema,
  operationsStatus,
} from '@snapform/contracts/operations';
import type {
  OperationsCheck,
  OperationsNotice,
  OperationsState,
} from '@snapform/contracts/operations';
import { boundedJson } from './owner-email';

export type OperationsEnvironment = {
  // '1' is on and 'drill' adds a labelled test failure; anything else is off.
  OPERATIONS_ENABLED?: string;
  OPERATIONS?: R2Bucket;
  OPERATIONS_ALERT_EMAIL?: string;
  RESEND_API_KEY?: string;
  EMAIL_FROM?: string;
};
export const operationsEnabled = (environment: OperationsEnvironment) =>
  environment.OPERATIONS_ENABLED === '1' ||
  environment.OPERATIONS_ENABLED === 'drill';

const site = 'https://snapform.jacked.dev';
// No form can have this ID, so the only right answer is a database-backed
// "not found". It travels the respondent's path: web, API and Neon.
const missingForm = '00000000-0000-4000-8000-000000000000';
const probes: {
  check: OperationsCheck;
  path: string;
  healthy: (response: Response) => boolean | Promise<boolean>;
}[] = [
  {
    check: 'website',
    path: '/',
    healthy: (response) =>
      response.status === 200 &&
      !!response.headers.get('Content-Type')?.startsWith('text/html'),
  },
  {
    check: 'forms',
    path: `/api/v1/public/forms/${missingForm}`,
    healthy: async (response) =>
      response.status === 404 &&
      JSON.stringify(await boundedJson(response)) ===
        '{"error":{"code":"FORM_UNAVAILABLE"}}',
  },
];
async function passes({ path, healthy }: (typeof probes)[number]) {
  for (let attempt = 0; attempt < 2; attempt++) {
    if (attempt) await scheduler.wait(5000);
    try {
      const response = await fetch(site + path, {
        // workerd has no 'error' mode; an unfollowed redirect is not healthy.
        redirect: 'manual',
        cache: 'no-store',
        signal: AbortSignal.timeout(10000),
      });
      const result = await healthy(response);
      if (!response.bodyUsed) await response.body?.cancel();
      if (result) return true;
    } catch {
      // Unreachable or unreadable is the failure being measured.
    }
  }
  return false;
}

const stateKey = 'status.json';
async function readState(bucket: R2Bucket): Promise<OperationsState | null> {
  const object = await bucket.get(stateKey);
  if (!object) return null;
  try {
    return operationsStateSchema.parse(
      await boundedJson(new Response(object.body)),
    );
  } catch {
    console.error(JSON.stringify({ event: 'operations_state_invalid' }));
    return null;
  }
}

const names: Record<OperationsCheck, string> = {
  website: 'website',
  forms: 'forms',
  jobs: 'background jobs',
  alerts: 'alert emails',
  drill: 'drill',
};
const details: Record<OperationsCheck, string> = {
  website: 'Website: the home page did not load.',
  forms:
    'Forms: a form could not be looked up, so respondents may not be able to open or submit forms. The database may be down.',
  jobs: 'Background jobs: two runs failed, so owner emails, webhooks and deletions may be late.',
  alerts: 'Alert emails: their settings were missing or invalid.',
  drill: 'Drill: this is a test. Nothing is broken.',
};
const india = new Intl.DateTimeFormat('en-GB', {
  dateStyle: 'medium',
  timeStyle: 'short',
  timeZone: 'Asia/Kolkata',
});
// Fixed wording and stable for one idempotency key: no answers, names, errors
// or credentials, and nothing that changes between two attempts.
function render(
  notice: OperationsNotice,
  incident: NonNullable<OperationsState['incident']>,
) {
  const { confirmed, notified, since } = incident;
  const parts = confirmed.map((item) => names[item]).join(', ');
  const started = `${india.format(new Date(since))} IST (${since.slice(11, 16)} UTC)`;
  const subject =
    notice === 'recovered'
      ? '[Snapform] Back to normal'
      : confirmed.join() === 'drill'
        ? '[Snapform drill] Test alert'
        : `[Snapform] ${notified.length === confirmed.length ? 'Still failing' : 'Problem'}: ${parts}`;
  const lead =
    notice === 'recovered'
      ? `Every check passed twice in a row. This is over; it started ${started}:`
      : `Snapform's own checks found a problem that started ${started}:`;
  const list = confirmed.map((item) => `- ${details[item]}`).join('\n');
  return {
    subject,
    text: `${lead}\n\n${list}\n\nWhat to do: https://github.com/jackedengineer/snapform/blob/main/docs/runbooks/alerts.md\nLive status: ${site}/api/v1/status\n\nYou get one email when something breaks, one a day while it lasts and one when it is over.\nSnapform`,
  };
}
const mailbox = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
function alertSettings(environment: OperationsEnvironment) {
  const { RESEND_API_KEY: apiKey, EMAIL_FROM: from } = environment;
  const to = environment.OPERATIONS_ALERT_EMAIL ?? '';
  return apiKey &&
    from &&
    !/[\r\n]/.test(from) &&
    to.length <= 254 &&
    mailbox.test(to)
    ? { apiKey, from, to }
    : null;
}
async function sendNotice(
  settings: ReturnType<typeof alertSettings>,
  notice: OperationsNotice,
  incident: NonNullable<OperationsState['incident']>,
) {
  if (!settings) return false;
  const day = incident.notifiedAt ?? incident.since;
  try {
    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      redirect: 'manual',
      signal: AbortSignal.timeout(10000),
      headers: {
        Authorization: `Bearer ${settings.apiKey}`,
        'Content-Type': 'application/json',
        'Idempotency-Key': `operations-v1-${notice}-${incident.confirmed.join('.')}-${Date.parse(day)}`,
      },
      body: JSON.stringify({
        from: settings.from,
        to: [settings.to],
        ...render(notice, incident),
      }),
    });
    if (!response.ok) {
      await response.body?.cancel();
      return false;
    }
    const result = await boundedJson(response);
    return (
      typeof result === 'object' &&
      result !== null &&
      'id' in result &&
      /^[0-9a-f-]{36}$/i.test(String(result.id))
    );
  } catch {
    // The caller logs a fixed event and the next run repeats the same email.
    return false;
  }
}

/**
 * Runs after each sweep, while the sweep has the database awake. The state
 * lives in R2 because the database is the likeliest thing to be down, and
 * because an outside check must be able to read it without waking Neon.
 */
export async function reportOperations(
  environment: OperationsEnvironment,
  jobsFailed: boolean,
) {
  const bucket = environment.OPERATIONS;
  if (!bucket) throw Error('OPERATIONS_CONFIGURATION_REQUIRED');
  const settings = alertSettings(environment);
  const [previous, results] = await Promise.all([
    readState(bucket),
    Promise.all(
      probes.map(async (probe) => ((await passes(probe)) ? [] : [probe.check])),
    ),
  ]);
  const failing: OperationsCheck[] = results.flat();
  if (jobsFailed) failing.push('jobs');
  if (!settings) failing.push('alerts');
  if (environment.OPERATIONS_ENABLED === 'drill') failing.push('drill');
  const now = new Date();
  const { state, notice } = nextOperations(previous, failing, now);
  let current = state;
  if (notice && state.incident) {
    if (await sendNotice(settings, notice, state.incident))
      current = noticeSent(state, notice, now);
    else console.error(JSON.stringify({ event: 'operations_alert_failed' }));
  }
  if (failing.length)
    console.error(JSON.stringify({ event: 'operations_failing', failing }));
  await bucket.put(stateKey, JSON.stringify(current), {
    httpMetadata: { contentType: 'application/json', cacheControl: 'no-store' },
  });
}

/** Public and content-free: when the checks last ran and what is failing. */
export async function handleOperationsStatus(
  request: Request,
  environment: OperationsEnvironment,
) {
  const reply = (status: number, body: string | null, extra = {}) =>
    new Response(body, {
      status,
      headers: {
        'Cache-Control': 'no-store',
        'X-Content-Type-Options': 'nosniff',
        'Content-Security-Policy': "default-src 'none'; frame-ancestors 'none'",
        'Referrer-Policy': 'no-referrer',
        ...extra,
      },
    });
  if (!operationsEnabled(environment)) return reply(404, null);
  if (!['GET', 'HEAD'].includes(request.method))
    return reply(405, null, { Allow: 'GET, HEAD' });
  let state: OperationsState | null = null;
  try {
    if (environment.OPERATIONS) state = await readState(environment.OPERATIONS);
  } catch {
    console.error(JSON.stringify({ event: 'operations_status_unavailable' }));
  }
  const result = operationsStatus(state, new Date());
  return reply(
    result.status === 'ok' ? 200 : 503,
    request.method === 'HEAD' ? null : JSON.stringify(result),
    { 'Content-Type': 'application/json' },
  );
}
