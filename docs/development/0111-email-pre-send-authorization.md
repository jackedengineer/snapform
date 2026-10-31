# Recheck owner email immediately before sending

31 October 2026. The Jobs dispatcher now requires a database authorization check
between claiming an email and contacting Resend. A rejected check counts as
superseded work; an unavailable check fails closed without a provider call or a
fabricated delivery receipt.

Migration 0036 grants the new check only to Jobs. It locks workspace before
delivery, verifies the current lease after acquiring the lock, then checks the
verified owner/recipient snapshot, enabled settings, submitted response,
idempotency window and pending deletion. Rejected eligibility cancels the work
or records the existing actionable reason. Cancelling a deletion request does
not revive that cancelled delivery. The internal pending-target predicate now
also includes durable purge intents, including retention expiry.

This adds one database statement per claimed email, no browser bundle code and
no dependency. The workspace lock is released before provider HTTP. A deletion,
settings or identity change after preparation cannot recall an email already in
flight; no exactly-once external delivery claim is made.

## Verification

The new dispatcher test failed before the change because authorization was
ignored. All 37 Jobs tests now pass, including revoked/unavailable preparation
with no send or record call. The restricted runtime test failed against the
absent function (42883), then checks that application execution is denied while
Jobs has the narrow grant.

All five affected database integration tests pass after migration. Formatting,
strict types, lint, production build, bundle budgets and the real Worker preview
pass, along with all 84 API tests and the production dependency audit. Browser
JS/CSS/font sizes are unchanged from 0110. The preceding full core
and database suites remain recorded there; this slice reruns the affected cases.

The operator-only `verify:email-send-guard` script uses one rollback transaction
and synthetic data without provider calls. Both candidate DDL and applied DDL
passed current eligibility, forged/expired leases, expired idempotency window,
revoked verification, changed recipient, response/workspace deletion, cancellation
and durable purge-intent checks. It never commits fixture writes.

Review found expiry could pass before an unchanged-row lock wait and become
stale during the wait. `scripts/verify-email-send-lock.mjs` reproduced this in the
isolated restored PostgreSQL container: Jobs returned true after expiry. The
post-lock check makes the same concurrency regression return false. The runner
removed the container afterward. It uses no Neon connection, network or exposed
port. Run it with the private backup environment and a verified archive manifest;
it installs migration 36 in the disposable copy if that function is absent.

No screen or interaction changed in this slice. The normal, power and adversarial
collector/inbox browser checks are recorded in 0110. Owner deletion controls
remain unexposed; scheduling/cancelling deletion through the browser still needs
its own later UI gate. This internal guard does not complete delivery-claim lock
ordering, active purge/replay or the remaining P0 release work.
