# Webhook attempt leases and exact payloads — 30 October 2026

Migration 0027 grants the restricted Jobs role three scoped functions: claim at
most five due jobs, prepare the exact payload under its active lease, and record
a bounded outcome. No direct table grant is added. Claims serialize with row
locks/SKIP LOCKED, increment at most eight attempts and fence work with a two-minute
lease. Expired in-flight work becomes Unknown without another automatic send.
Settings changes stop claims; cancelled/stale leases cannot prepare or overwrite
newer facts. Reads use immutable configuration/version identity.

Preparation validates the version-1 envelope, test/type/identity/time/field-list
context and current endpoint. First preparation stores raw text; subsequent
attempts reuse those bytes. A changed body fails bytea comparison regardless of
collation. Malformed JSON/Unicode/shape, oversized input and wrong identity fail
before network I/O. An acknowledgement requires a stored payload, current active
lease and 2xx status. Null/malformed outcome tuples fail closed. Retry-After is
bounded in storage; expiry/backoff/attempt ceilings remain authoritative.
Only an acknowledged test marks its still-current configuration verified.

Protocol mapping is version 1 and maps effective ordered fields generically;
form-version identities are data pinned in each payload, not a custom mutable
mapping. URL/key edits create a new configuration and invalidate preflight.
A future incompatible mapping/protocol release must version its payload and
explicitly invalidate old verification before activation; it must not silently
rewrite stored retry bytes.

The first attempt test exposed Neon's operator SET ROLE restriction. That was
preserved. Privileged state-machine fixtures now run in one owner transaction;
an actual snapform_jobs login separately proves its identity and EXECUTE grants.
The test then failed at the intended missing-function boundary before SQL existed.
After migration it passes exclusive repeated claims, test acknowledgement,
immutable preparation, malformed input/null rejection, retry/backoff, changed
lease fencing, acknowledged idempotence, expiry to Unknown and settings fences.
All fixture writes roll back and post-rollback checks find no user/ledger rows.
No HTTP request/provider acknowledgement was simulated as a live success.
Command: `pnpm --filter @snapform/database verify:webhook-attempts`.

An actual snapform_runtime login proves all three functions inaccessible, with
unexpected calls also wrapped in rollback transactions. Full restricted-Neon
suite passes 48 tests. Formatting/types/lint pass after preserving the local
operator error cause as required by lint. No runtime source/dependency/bundle
entry changed in this SQL slice; preceding build/bundle artifacts remain valid.
Serial fixture exclusion is not a multi-connection race proof. That owned-job
rehearsal, live receiver/timeout checks and normal/power/adversarial preflight,
send/history/retry browser workflows remain activation gates. No test database,
production role expansion for testing, broad table grant or reset was used.
