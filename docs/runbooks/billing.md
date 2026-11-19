# Razorpay billing

Snapform bills Pro per workspace through Razorpay Subscriptions. The API Worker
(`snapform-api`) creates and cancels subscriptions at a user's request and
receives webhooks.

## Modes

`RAZORPAY_MODE` is required and must be exactly `test` or `live`.

| Mode   | Key ID must start | Also required             | Plan variables read                                 |
| ------ | ----------------- | ------------------------- | --------------------------------------------------- |
| `test` | `rzp_test_`       | none                      | `RAZORPAY_PLAN_PRO_{MONTHLY,ANNUAL}_{INR,USD}`      |
| `live` | `rzp_live_`       | `SNAPFORM_ENV=production` | `RAZORPAY_LIVE_PLAN_PRO_{MONTHLY,ANNUAL}_{INR,USD}` |

Any mismatch (no mode, a live key in test mode, live mode outside production, a
missing INR plan, a malformed plan ID, or only one of the two USD plans) makes
billing report **not configured**. The billing page says so, checkout and the
webhook answer 503, and nothing falls back to the other mode. Each mode reads only
its own plan variables.

INR monthly and annual plans are required. USD is optional: with no USD plans
the pricing page and checkout offer INR only and hide the currency choice. The
Razorpay dashboard creates INR plans; cards issued outside India can still pay
an INR plan when **International payments** is enabled on the Razorpay account
(Account & Settings → Payment methods). Razorpay converts at its own rate.

## Production (live)

`apps/api/wrangler.jsonc` already sets these non-secret variables:

```
SNAPFORM_ENV=production
RAZORPAY_MODE=live
RAZORPAY_LIVE_PLAN_PRO_MONTHLY_INR=plan_Tzv3aPxiqwY0NV   # ₹1,499 every month
RAZORPAY_LIVE_PLAN_PRO_ANNUAL_INR=plan_Tzv4ZTrM9Fyak0    # ₹14,990 every year
```

Set the secrets interactively. Wrangler prompts for each value, so it never
appears in shell history or in a file. Paste values from the Razorpay
dashboard; never commit or log them.

```sh
# API Worker: checkout, cancellation and webhooks
pnpm exec wrangler secret put RAZORPAY_KEY_ID -c apps/api/wrangler.jsonc        # rzp_live_…
pnpm exec wrangler secret put RAZORPAY_KEY_SECRET -c apps/api/wrangler.jsonc
pnpm exec wrangler secret put RAZORPAY_WEBHOOK_SECRET -c apps/api/wrangler.jsonc
```

Then deploy through the reviewed deployment in [deploy.md](deploy.md).
To pause billing, delete `RAZORPAY_KEY_ID` from the API Worker; the page then
shows billing as not configured and no new checkout starts.

## Razorpay dashboard (live mode)

Switch the dashboard to **Live Mode** first; test and live objects are separate.

1. **Plans** (Subscriptions → Plans): the two INR plans above exist. A new plan
   must match `packages/contracts/src/plans.ts` prices exactly, then go into
   the `RAZORPAY_LIVE_PLAN_…` variable for its interval and currency.
2. **API keys** (Account & Settings → API Keys): generate a live key. The key
   secret is shown once; put it straight into `wrangler secret put`.
3. **Webhook** (Account & Settings → Webhooks → Add new webhook):
   - URL: `https://snapform.jacked.dev/api/v1/billing/razorpay/webhook`
   - Secret: a new random value of at least 32 characters, also given to
     `wrangler secret put RAZORPAY_WEBHOOK_SECRET`.
   - Alert email: an address the owner reads.
   - Active events: `subscription.activated`, `subscription.charged`,
     `subscription.pending`, `subscription.halted`, `subscription.cancelled`,
     `subscription.completed`.

When a renewal charge fails, Razorpay retries it and sends
`subscription.pending`. The workspace keeps Pro while it retries, for at most
30 days after the paid period, and the owner sees **Update card**, which opens
Razorpay's card change for that subscription; a new checkout is refused so no
one is charged twice. `subscription.halted` (retries exhausted) moves the
workspace to Free at once. Cancelled and completed subscriptions keep the
period already paid for (migration 0047).

Other events are acknowledged with 200 and change nothing (they are recorded
only for dedupe). Snapform never pauses subscriptions; `subscription.paused`
and `subscription.resumed` are ignored, so a subscription paused from the
dashboard keeps Pro only until its paid period ends.

## Local and staging (test mode)

In `apps/api/.dev.vars` (ignored by Git):

```
RAZORPAY_MODE=test
RAZORPAY_KEY_ID=rzp_test_…
RAZORPAY_KEY_SECRET=…
RAZORPAY_WEBHOOK_SECRET=…
RAZORPAY_PLAN_PRO_MONTHLY_INR=plan_…
RAZORPAY_PLAN_PRO_ANNUAL_INR=plan_…
# Optional, both or neither:
# RAZORPAY_PLAN_PRO_MONTHLY_USD=plan_…
# RAZORPAY_PLAN_PRO_ANNUAL_USD=plan_…
```

`.dev.vars` overrides the live values in
`wrangler.jsonc`; without `RAZORPAY_MODE=test` local billing stays off. Create
the test plans in the dashboard's **Test Mode**. Automated tests use a fake
Razorpay and never call it.
