# Restore replay validation and migration prefix

1 November 2026. The restore utilities now authenticate the complete bounded
union of pending SQL intents and retained encrypted R2 objects before taking any
deletion action. Conflicting IDs/targets, duplicate object keys, corrupt or
misbound ciphertext, unexpected content, future timestamps and excessive batches
fail closed. Old SQL-pending intents are retained regardless of R2 object age.
Workspace deletion runs first, and every SQL application requires an explicit
durable-ledger acknowledgement. These utilities always report `trafficSafe:false`.

The migration utility accepts an SQL capability from the isolated restore runner,
not a database URL. It verifies the archive's exact ordered source-hash/timestamp
prefix before applying a missing migration. Each reviewed suffix migration and
its Drizzle journal entry share one owner transaction. Drift or a source tree
older than the archive is refused before DDL.

Five native regression tests were added before implementation. They cover union
ordering, complete authentication before callbacks, conflicts, failed/false
acknowledgements, rejected finalization and migration drift. All 32 recovery
tests pass (25 archive/transport/replay tests and seven restore-process tests),
along with formatting, types and lint. The current focused rerun also passes.
An actual authenticated 32-migration snapshot was restored with no network or
published ports, upgraded by six reviewed migrations to 38, and passed the
restricted-role checks. The runner removed the container and plaintext afterward.
Read-only review found no concrete trust/correctness blocker. No dependency added.

The operator also created and unlocked a Bitwarden EU vault. The three stable
backup, purge-ledger and webhook encryption keys were stored in the secure note
“Snapform — production recovery keys” and compared to private configuration
without printing them. The note was closed; private proof is
`.recovery/bitwarden-recovery-saved.png`. No remote key was changed or rotated.

Remote R2 listing/read permissions, actual SQL replay, restored delivery/session
quarantine and authoritative quiescence remain unfinished integration. These
utilities are not yet wired into the nightly restore, and scheduled purge remains
off. There is no new browser feature in this slice; application browser evidence
and the deployed-preview limitations remain in 0112–0114.
