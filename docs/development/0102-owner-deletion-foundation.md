# Owner deletion requests: inactive foundation

Migration 0031 adds content-free owner request metadata and scoped SQL operations
for scheduling, reading and cancelling response/workspace deletion. Scheduling
requires the exact confirmation and acknowledgement, keeps a 24-hour cancellation
window, and cancels pending outbox/email/webhook work. Cancelling never replays
previous delivery. Reusing a cancelled request ID returns its original receipt.
Actual membership is checked inside each privileged SQL operation; a forged role
setting cannot grant ownership. Runtime has no direct metadata-table access.

The migration was preflighted transactionally, then applied to the shared Neon
database. Its generated snapshot adds only the request table. No API, UI or active
Jobs claim is exposed by this foundation. Collection/write guards, due claims,
physical workspace purge, recovery replay and metadata cleanup remain required
before activation. An already in-flight provider request may still arrive.

Behavioral contracts were red before implementation. The rollback-only database
fixture covers owner/editor authorization, exact confirmations, stable duplicate
identities, stale cancellation, cross-workspace reads, cancellation and subsequent
requests, plus direct SQL with a forged owner role and restricted grants. A
separate operator probe reproduced cancellation after the deadline within one
SQL statement: statement-start time was stale after a lock/wait. The implementation
uses wall-clock time after obtaining locks; pre- and post-migration probes pass
and verify synthetic data rolled back. No second database or persistent fixture
was created.

The initial helper used the generic workspace precheck plus SQL's authoritative
membership check. A longer negative fixture exceeded its unchanged 30-second
limit. The scoped helper now sets the verified actor/workspace once per transaction
and calls the authorizing SQL operation directly, removing two redundant network
round trips per operation. The SQL checks, strict receipt validation and rollback
behavior remain unchanged. The same expanded fixture passed in 19.56 seconds
including startup. This is not a production latency/SLO measurement.

Browser checks do not apply to these unexposed operations yet. They remain a
blocking gate for the future API/UI slice; no user-facing deletion completion is
claimed here.
