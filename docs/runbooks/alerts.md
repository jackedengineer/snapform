# Snapform alerts

Two independent checks tell the operator when Snapform breaks. Neither promises
customers a response time or an availability figure.

| Check | Runs | Looks at | Tells you by |
|---|---|---|---|
| Jobs Worker | Every 30 minutes, after each sweep | Its own run, the home page and a form lookup that needs the database | Email through Resend |
| GitHub `Operations check` | Hourly | The home page, `/api/v1/health` and `/api/v1/status` | GitHub's failed-workflow email |

The Jobs check finds most problems and says what is wrong. The GitHub check runs
outside Cloudflare and Resend, so it also notices when those are down, the Cron
has stopped or the alert email itself cannot be sent.

## What each email means

- **Website:** the home page did not return a page, twice in a row.
- **Forms:** looking up a form did not work, twice in a row. Respondents may be
  unable to open or submit forms. The database is the usual cause.
- **Background jobs:** two sweeps failed. Responses are still saved, but owner
  emails, webhooks and deletions may be late. One failed sweep sends nothing,
  because the next one repeats the work.
- **Alert emails:** the sender, recipient or Resend key is missing or invalid.
- **Drill:** a deliberate test. Nothing is broken.

You get one email when something breaks, one more if another part breaks, one a
day while it lasts, and one after every check has passed twice in a row. Emails
contain fixed wording only: no answers, names, workspaces, errors or credentials.

`https://snapform.jacked.dev/api/v1/status` shows the current result: `ok`,
`failing`, `stale` (no run for 75 minutes) or `unknown`. Only `ok` returns 200. It
is public, content-free and rate limited, and returns 404 while alerts are off.

## Why the status is in R2 and not in Neon

The database is the likeliest thing to be down, and a database-backed status
would wake it for every outside check. One small object, `status.json`, in the
private `snapform-operations` bucket holds the last result and the open incident.
It is safe to delete; the next run starts over.

Cost: the GitHub check never opens Neon. The Jobs check adds one form lookup in
the seconds after a sweep, while the database is already awake; at 48 runs a day
that is about 0.2 CU-hours a month of the 100 included. R2 use is about 1,440
writes a month. This is an estimate: compare Neon's usage page after a week.

## Respond

1. Open the status URL, then the home page and a form you own.
2. **Forms or everything:** check the Neon project first (suspended, over its
   monthly limit, or an outage), then the newest deployment of `snapform-api` and
   `snapform-web`. Roll back a bad deployment with [deploy.md](deploy.md).
3. **Background jobs only:** search the `snapform-jobs` logs in Cloudflare for
   `response_jobs_failed`. Check the Jobs database login and the purge settings.
   Do not reset event IDs, attempts or retry windows to make work look new.
4. **Alert emails:** check the names of the Jobs secrets, then the Resend account.
5. **GitHub only, status `stale`:** check the Cron trigger and newest deployment
   of `snapform-jobs`. `operations_report_failed` in its logs means the bucket is
   missing or R2 is unavailable.
6. Write down what happened, its effect and the fix, without customer data.

## Turn on

Each step changes production, so it needs the owner's go-ahead.

1. Create the bucket once, before deploying Jobs:
   `pnpm exec wrangler r2 bucket create snapform-operations`. Keep it private.
2. Confirm that `OPERATIONS_ALERT_EMAIL` and `RESEND_API_KEY` are listed by
   `pnpm exec wrangler secret list -c apps/jobs/wrangler.jsonc`. Names only.
3. Deploy Jobs in drill mode, then the API:
   `pnpm exec wrangler deploy -c apps/jobs/wrangler.jsonc --var OPERATIONS_ENABLED:drill`
   `pnpm exec wrangler deploy -c apps/api/wrangler.jsonc`
4. Run the drill below. Continue only when both emails arrive.
5. Merge a change that sets `OPERATIONS_ENABLED` to `"1"` in
   `apps/jobs/wrangler.jsonc` and adds the hourly schedule to
   `.github/workflows/operations.yml`, then deploy Jobs normally. A deploy without
   that change would switch alerts off again.
6. Within about an hour expect "Back to normal" and status `ok`.
7. Confirm that the schedule fires: within two hours
   `gh run list --workflow operations.yml` must show an event `schedule`.

Never merge a change to the workflow while it is disabled. On 24 November GitHub
then showed it as active but started no scheduled run, and a manual run started
right after re-enabling it stayed queued. GitHub's documented fix is to commit a
change to the cron line.

## Drill

1. With Jobs in drill mode, wait for the next :00 or :30. Expect one email,
   "[Snapform drill] Test alert", and status `failing` with only `drill`.
2. Run the GitHub check: `gh workflow run operations.yml`. It must fail, because
   the status is failing, and GitHub must email you. If it does not, turn on
   failed-workflow emails in GitHub's notification settings.
3. Repeat after changing the recipient, the sender or the Resend key. To test the
   GitHub email alone: `gh workflow run operations.yml -f alert_drill=true`.

## Turn off

Set `OPERATIONS_ENABLED` to `"0"`, deploy Jobs and run
`gh workflow disable operations.yml`.

## Not covered

- Sign-in, sign-up emails, the editor, billing and uploads.
- One owner's failed notification or webhook, and the `snapform-response-dead`
  queue.
- Slow pages and partial regional outages.
- Missing or failed backups. A failed backup run sends GitHub's own email.
- Reaction time: expect up to 30 minutes for the website or forms, up to an hour
  for background jobs, and longer when GitHub delays a scheduled run.
- The GitHub schedule itself stopping. Nothing reports it; Jobs alerts still work.
- GitHub turns off schedules in a public repository after 60 days without
  activity. Re-enable the workflow if development pauses that long.

Sources: [GitHub schedule notifications and inactivity](https://docs.github.com/en/actions/reference/workflows-and-actions/events-that-trigger-workflows#schedule),
[Resend idempotency keys](https://resend.com/docs/dashboard/emails/idempotency-keys),
[Workers fetch and custom domains](https://developers.cloudflare.com/workers/configuration/routing/custom-domains/).
