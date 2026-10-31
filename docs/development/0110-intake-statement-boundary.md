# Intake statement boundary

31 October 2026. Admission and recovery now each use one authorized database
statement. Mutation reads the pinned definition, prepares answers through the
existing pure contract, then performs one atomic authorized write. This removes
extra context-setting and transaction round trips without moving validation or
authorization into the browser.

Migration 0035 adds narrowly granted functions around the canonical admission,
read and mutation functions. Rejected statements roll back their context, quota,
session and outbox effects. Revision, capability, deletion and quota checks remain
inside the write boundary. Successful reads within a caller-owned transaction
establish anonymous intake context; later private operations must scope their
identity as before. This is not a promise to restore context from before an
entire multi-statement helper when JavaScript preparation fails.

## Evidence

- Transport-budget tests failed against the previous multiple-statement helpers,
  then passed with one statement for admission and recovery. These tests do not
  establish SQL authorization; the restricted-login integration tests do.
- Real Neon rollback fixtures verify session-ID collision leaves no quota row,
  wrong capability restores prior context, stale submission changes no counters,
  successful submission and retry produce one receipt/event, and internal scope
  and Jobs privileges stay denied. All 63 database tests and 3 auth integration
  tests pass. The isolated restored copy also passed rejection, deletion,
  cancellation and unpublished-receipt retry checks before applying migration 35.
- All 84 API, 238 core and 36 Jobs tests pass. Core coverage: 99.84% lines,
  100% functions, 99.17% statements and 97.74% branches. Formatting, strict types,
  lint, production build and production dependency audit pass.
- Real Worker preview passes SSR/CSP, native export authorization and provider
  callback boundaries. Two API reloads and three auth request/cleanup cycles pass.
- Gzip: all emitted JS 204.36 KiB; home 119.34, collector 160.19, editor 182.44,
  inbox 162.78 KiB; CSS 8.09 and font 36.07 KiB. No dependency added. These are
  branch artifact measurements, not deployed latency or Web Vitals measurements.

## Browser checks

The local application used the real Worker and shared Neon with an owned
synthetic form; notifications and webhooks were disabled for that form.

- Normal: conditional eight-card flow, review, successful submission, receipt
  and owner inbox detail all worked. Required-field validation and optional
  refusal worked; zero, consent and multiple choices survived persistence.
- Power: keyboard progression, back/review, reload answer recovery, long Unicode
  text and duplicate-tab exclusion worked. A double click produced one submit
  operation and one outbox event, with no email or webhook delivery.
- Adversarial: injection-shaped text remained plain text in the inbox with no
  injected SVG/script/iframe. Missing capability returned 401, unknown body key
  422, cross-origin mutation 403 and wrong media type 415 at the real local API.
- At 390 × 844, the owner inbox had no horizontal overflow; selecting a response
  focused its heading in view. Browser console contained no errors. Viewport was
  restored afterward. Completion screenshots remain private recovery evidence.

Reload restores answers but currently returns to the first card. Persisting the
navigation position remains a collector polish task. The local challenge used
the configured development verifier; the separate production Incognito receipt
was checked with genuine automatic Turnstile verification. No production SLO,
screen-reader or physical mobile-device claim is made.

External Neon connection delays remain possible. This reduces avoidable round
trips; it does not establish that every observed upstream timeout is resolved.
Delivery deletion guards, active purge/replay and owner controls remain separate
unfinished P0 work.
