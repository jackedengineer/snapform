import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

// Runs outside Cloudflare, so a stopped Worker, Cron or mail provider is still
// noticed. None of these reads opens the database, so it can stay asleep.
const site = 'https://snapform.jacked.dev';
const ok = async (response) =>
  response.status === 200 && (await response.json())?.status === 'ok';
const probes = {
  website: [
    '/',
    (response) =>
      response.status === 200 &&
      Boolean(response.headers.get('Content-Type')?.startsWith('text/html')),
  ],
  api: ['/api/v1/health', ok],
  // Jobs reports its own last run here; see docs/runbooks/alerts.md.
  jobs: ['/api/v1/status', ok],
};
export async function checkOperations({ fetch, wait }) {
  const failing = [];
  for (const [name, [path, healthy]] of Object.entries(probes)) {
    let passed = false;
    for (let attempt = 0; attempt < 2 && !passed; attempt++) {
      if (attempt) await wait(10_000);
      try {
        const response = await fetch(site + path, {
          redirect: 'error',
          cache: 'no-store',
          signal: AbortSignal.timeout(10_000),
        });
        passed = await healthy(response);
        if (!response.bodyUsed) await response.body?.cancel();
      } catch {
        passed = false;
      }
    }
    if (!passed) failing.push(name);
  }
  return failing;
}
// Fixed output only: this log is public.
export async function runCheck({ check, drill, print }) {
  const failing = await check();
  const runbook = 'docs/runbooks/alerts.md';
  if (failing.length) {
    print(`::error title=Snapform is failing::${failing.join(', ')}`);
    print(JSON.stringify({ event: 'operations_failing', failing, runbook }));
    return 1;
  }
  if (drill) {
    print('::error title=Snapform alert drill::Nothing is broken');
    print(JSON.stringify({ event: 'operations_alert_drill', runbook }));
    return 1;
  }
  print(JSON.stringify({ event: 'operations_verified' }));
  return 0;
}
if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(resolve(process.argv[1])).href
)
  process.exitCode = await runCheck({
    check: () =>
      checkOperations({
        fetch,
        wait: (ms) => new Promise((done) => setTimeout(done, ms)),
      }),
    drill: process.env.SNAPFORM_ALERT_DRILL === 'true',
    print: console.log,
  });
