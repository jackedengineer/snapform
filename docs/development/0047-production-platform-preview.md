# Production platform preview — 29 October 2026

The user authorized deployment at **https://snapform.jacked.dev** and completion
of the six immediate P0 workstreams. This is a private preview, not a declaration
that the wider market V1 or all six workstreams are finished.

## Configured and observed

- Web custom domain/TLS, same-origin API service binding, disabled direct
  `workers.dev`/preview ingress on both Workers. Initial API startup measured
  68 ms; web startup measured 10–11 ms. These are deployment reports, not request
  latency percentiles.
- Production uses the existing restricted Neon runtime identity, a separate
  signing secret, scoped Resend sending key and an approved dedicated Turnstile
  widget limited to this hostname. Migration ownership remains local.
- The explicitly approved GitHub Actions secrets are configured; production
  signing credentials and migration ownership were not copied into CI.
- Liveness, homepage and public challenge configuration return 200. Liveness
  intentionally does not assert database or delivery readiness.
- HTTPS HTML and API replies include host-only HSTS (`max-age=31536000`), CSP,
  no-store, nosniff and no-referrer. HSTS unit tests preserve multiple auth
  cookies, body and API CSP, and leave local HTTP unchanged.

## Actual journeys

Normal: existing owned QA account signed in, opened its workspace/editor and
  saw the correct production share URL. A real Turnstile-verified session
  completed the seven applicable card questions, editable review and durable
  submission. Neon independently contained exactly one finalized record for
  that owned receipt. Authentication recovery was exercised through native
  HTTP; no human email-inbox or new-password browser completion is claimed.

Power: refresh recovered previous answers; navigation through all applicable
  questions retained values. A separate native auth probe verified Secure,
  HttpOnly and SameSite=Lax cookies, authenticated `/me`, sign-out and subsequent
  401 using only its own newly issued cookie. The browser's session stayed open.

Adversarial: unsigned publication read 401; cross-origin publish 403;
  oversized publication JSON 413; invalid auth input 422. Markup-like synthetic
  content remained literal in review and produced zero injected image elements.
  No unrelated application or customer data was targeted. Full cross-user and
  role matrices still rely on the existing real RLS/Worker tests, not a claim
  that one owned browser identity proves all tenant isolation.

The card acknowledgment visibility defect was caught and fixed during this
journey; see [regression evidence](0045-card-acknowledgment-regression.md).
The real provider challenge iframe emitted opaque obfuscated console messages;
first-party publishing showed no console errors. No assertion of a universally
clean third-party console, accessibility certification or deployed SLO is made.

## Rollback rehearsal

Rolled the web Worker from `752684a1-84cd-4e3f-961f-97ca9ffea924` back to
`a3788b93-3a57-4812-a083-61186eca1a3d` on the synthetic-data preview. Liveness
remained 200 with HSTS. Restored version `752684a1-84cd-4e3f-961f-97ca9ffea924`
at 100%. No database rollback or response deletion occurred. Database/file
restore, retention/deletion, outbox/Queues and external monitoring remain open.

Latest local checks: 182 unit cases, 63 Worker cases, eight focused publication
database cases; types, lint, formatting and both builds pass. Pure-core coverage
remains 100% lines/functions, 99.75% statements and 98.76% branches. Bundle:
199.53 KiB JS gzip, 6.98 KiB CSS, 36.07 KiB font. Hosted latest-revision CI and
branch protection are still being verified; previous-run failures are recorded
in [CI isolation](0046-publication-ci-isolation.md).

[Deployment runbook](../runbooks/deploy.md),
[Turnstile configuration](../evidence/41-production-turnstile.png),
[encrypted CI secret names](../evidence/42-github-ci-secrets.png).
