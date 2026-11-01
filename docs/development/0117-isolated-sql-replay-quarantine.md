# Isolated SQL replay and quarantine

1 November 2026. Restore helpers accept only the disposable runner's SQL
capability, never a connection URL. They read at most 10,000 pending intents as
strict metadata, match existing identity including millisecond-normalized creation
time, and call the existing workspace/response finalizer in an owner transaction.
An identity/target conflict, false finalizer, remaining target or missing explicit
acknowledgement fails closed. Provider errors are replaced with fixed error codes.

After replay, quarantine refuses any pending purge. It removes restored auth
sessions/verification tokens, clears OAuth tokens, replaces collector capability
hashes, completes historical outbox work and cancels unfinished email/webhook
deliveries with cleared leases. Password hashes, user identities and unrelated
responses remain. This affects only the isolated copy and never reopens traffic.

Three behavioral tests failed before implementation and now pass. The actual
`verify-restore-safety.mjs` operator regression upgraded the eligible private
32-migration archive to 38 in a network-none container. Synthetic workspace and
response intents replayed, including a January SQL intent older than the R2
lifetime and a microsecond timestamp matching its millisecond ledger identity.
Changed metadata/IDs/workspace ownership were refused without deleting targets.
Replays were idempotent, recreation guards held, unrelated data survived and all
quarantine assertions passed twice. The runner removed its container and plaintext.

All 39 native recovery tests, formatting/types/lint, production build, route/total
bundle limits, production dependency audit and real Worker preview/reload checks
passed. The web artifact remains 208.05 KiB JS gzip, 8.59 KiB CSS and 36.07 KiB
primary font. Read-only review found no required correction. No new dependency.

This is SQL and local synthetic-ledger evidence. The live R2 reader, entire remote
union and SQL acknowledgement still need orchestration into the hosted drill.
The snapshot-only runner continues to report purge replay as unexercised.
Purge activation remains off. No user interface changes in this slice.
