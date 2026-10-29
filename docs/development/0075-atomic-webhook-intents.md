# Atomic webhook intents — 30 October 2026

Migration 0026 seeds an immutable-configuration webhook intent inside the existing
submitted-response outbox transaction, only when that form is enabled and its
configuration is verified. This adds no Worker-to-Neon round trip. A settings-row
share lock serializes the opt-in decision with changes; event uniqueness keeps
submission retries on one delivery identity. It performs no HTTP request and
never claims endpoint success. No historical response is backfilled on opt-in.

Disabling cancels further work; replacing an endpoint cancels old-version work
without retargeting it. Pending/preview/in-flight/unknown/actionable records stop,
leases clear, and acknowledged history remains intact. An in-flight request may
still reach its original endpoint. Re-enable never resurrects cancelled work.
Functions have fixed search paths, qualified tables and no public/app/Jobs direct
execute grant; only their scoped triggers invoke them.

The local operator test failed first with no intent after submission. After the
migration, it passes future-only opt-in, atomic response/event identity, duplicate
submit, disable/re-enable, in-flight cancellation, acknowledged-history retention,
immutable destination and application-role write denial. It simulates trusted
verification/in-flight/ack facts only inside the fixture; it is not a provider
success claim. One transaction always rolls back; post-rollback user/ledger checks
confirm no fixture remains. No external request is sent. Command:
`pnpm --filter @snapform/database verify:webhook-intents`.

Full restricted-Neon suite passes 46 tests after the trigger migration; extended
trigger ACL checks also pass. The operator-only command requires ignored local
migration configuration, never an owner credential in runtime or CI. No test
DB/branch, truncation, reset or broad runtime table grant was introduced. The
preceding build/bundle artifacts are unchanged because this slice is SQL/test/
configuration documentation. Types/lint/format gates apply before commit.

Private key requirements are now in API/Jobs example files and the deployment
runbook. The one database requires a stable shared integration encryption key;
Jobs production still needs its copy before activation. Existing settings browser
proof remains in 0072/0074. Enabled collection, exact-byte stored attempts and
preflight/live browser tests remain subsequent gates; the feature is not complete.
