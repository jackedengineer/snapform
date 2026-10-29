# Snapform deployment

Public application: **https://snapform.jacked.dev**. The `snapform-web` Worker
serves hashed assets and TanStack Start pages and forwards `/api/` through its
`API` service binding to `snapform-api`. Both Workers disable `workers.dev` and
preview URLs. Do not add a second public API origin.

## Configuration

- API variables in Wrangler: production mode, exact Better Auth origin,
  transactional sender and public Turnstile site key.
- API secrets: `DATABASE_URL` (restricted runtime login), a dedicated
  `BETTER_AUTH_SECRET`, `RESEND_API_KEY` and `TURNSTILE_SECRET_KEY`.
- Migration ownership remains only in ignored local configuration. Never upload
  `DATABASE_MIGRATION_URL` to an application Worker or Actions secrets.
- The production Turnstile widget allows only `snapform.jacked.dev`, uses
  managed challenges and does not enable pre-clearance.
- GitHub Actions has the explicitly approved `SNAPFORM_DATABASE_URL` and a
  separate CI-only `BETTER_AUTH_SECRET`. It supplies fake email configuration;
  database fixtures roll back in the one existing Neon database.
- Local `.env.production`, `.env.ci` and `.env.qa` are private, ignored and mode
  0600. Never print them or include them in a support bundle.

## Reviewed deployment

1. Use a focused branch and inspect the diff. Run `pnpm check` and the production
   dependency audit; resolve failures rather than changing thresholds.
2. Run `pnpm build`. The Vite output config is authoritative for web assets and
   SSR modules. Auxiliary Workers need individual deployment.
3. Deploy API: `pnpm exec wrangler deploy -c apps/api/wrangler.jsonc`.
4. Configure any required secret names using private stdin or ignored files,
   never command-line values. Do this before exposing a new web entry point.
5. Deploy web: `pnpm exec wrangler deploy -c apps/web/dist/server/wrangler.json`.
6. Confirm the deployment version and custom domain. Check homepage and
   `/api/v1/health`, then perform authenticated and respondent journeys with
   owned synthetic data. Check cookies, CSP, no-store, HSTS and rejected writes.

The health endpoint is **liveness**, not evidence that Neon/email/Queues are
healthy. Record separate dependency checks. No real customer data or live
payment belongs in a deployment smoke test.

## Web rollback

Record the current verified version before each deployment. Roll back with:

```sh
pnpm exec wrangler rollback VERSION_ID -c apps/web/wrangler.jsonc --message 'Reason' --yes
```

Verify health and auth after rollback. To restore a verified version:

```sh
pnpm exec wrangler versions deploy VERSION_ID@100 -c apps/web/wrangler.jsonc --message 'Reason' --yes
```

Worker rollback does not roll back database migrations or stored responses.
Keep database changes additive and review a separate recovery plan. Retention,
combined backup/restore, external monitoring and delivery recovery remain
separate release gates until their implementation and evidence are recorded.

Sources: [Vite auxiliary Workers](https://developers.cloudflare.com/workers/vite-plugin/reference/api/),
[custom domains](https://developers.cloudflare.com/workers/configuration/routing/custom-domains/),
[secrets](https://developers.cloudflare.com/workers/configuration/secrets/).

## Response transport Worker

Deploy `apps/jobs/wrangler.jsonc` separately. Its only secret is `DATABASE_URL`
for the restricted `snapform_jobs` identity; never copy API auth secrets or the
migration owner. Cron and Queue configuration live in Wrangler. Confirm an owned
synthetic event reaches a durable transport receipt, then inspect queue backlog,
retries and the `snapform-response-dead` queue. Cron propagation can take up to
15 minutes. A transport receipt does not prove provider notification delivery.
