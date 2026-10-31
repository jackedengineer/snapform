# Due owner requests and consistent purge locking

Unapplied migration 0032 reserves bounded irreversible intents after an owner's
24-hour cancellation window. Pending intents are retried first. Workspace purge
explicitly removes responses and publication references before workspace cascades,
retains content-free audit/requests and prevents workspace identity reuse. Trial
usage is preserved. Only Jobs can claim or finalize; the runtime cannot invoke
these functions. The caller must acknowledge the encrypted R2 ledger before
finalizing. No active Worker wiring or user-facing deletion controls ship here.

The owner behavior probe was red before the SQL functions existed. Its first
rollback-only Neon preflight passed exact deadlines, repeated claims/finalization,
cancellation denial once claimed, response/workspace scope, cascade ordering,
usage preservation, identity reuse and privilege checks. The operator command
now expects the migration to be installed; it does not hold live workspace DDL
locks through a long fixture. Further live preflight attempts hit the existing
five-second lock limit while CI was writing; their DDL and fixture writes rolled
back. These were not successful migration runs.

Fresh-context review identified two races, both reproduced against a private
network-isolated restored copy using concurrent psql sessions, synthetic triggers
and advisory gates. Whole-workspace and response finalizers could deadlock through
inverted locks. Expiry could observe no pending workspace deletion, then reserve
an intent after scheduling committed inside the cancellation window.

The migration now locks workspace before intent/response work in both finalizers.
Expiry locks an eligible workspace first, rechecks pending deletion after that
lock, then selects expired responses. It excludes owner requests and returns only
expiry intents. The same isolated regression changed from deadlockObserved=true /
expiryAfterPendingObserved=true to both false, with successful finalizers and
serialized scheduling. Its disposable database and plaintext were removed.

The generated custom-migration snapshot matches 0031's schema exactly apart from
its IDs. No dependency or client bundle changes. Applying the reviewed migration,
post-apply rollback verification, retaining the concurrency harness in the source
tree and Worker/browser verification remain required before activation.
