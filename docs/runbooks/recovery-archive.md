# Encrypted logical recovery archive

Neon point-in-time recovery is the primary database recovery mechanism. A
logical archive is an additional independent recovery copy, not a replacement
for WAL/PITR or the five-minute RPO target. PostgreSQL's consistent export does
not by itself establish full production recovery. [PostgreSQL pg_dump](https://www.postgresql.org/docs/current/app-pgdump.html).

The production branch's actual dashboard showed a **six-hour history window**
on 30 October 2026, with no snapshots or snapshot schedule configured.
[Observed configuration](../evidence/62-neon-recovery-window.jpg). Do not promise
a longer PITR window or infer that logical export/restore proves PITR recovery.

`node --env-file=.env.backup scripts/backup-postgres.mjs .recovery` requires an
explicit `DATABASE_BACKUP_URL` for the direct `snapform` endpoint and a canonical
32-byte base64 `BACKUP_ENCRYPTION_KEY`. Do not put a migration-owner credential
into application or CI runtime configuration. The initial operator-only export
used the private local owner configuration; a restricted automated backup
identity and schedule still need implementation. Store the encryption key in
independent operator recovery custody before relying on remote copies.

The tool runs a pinned PostgreSQL client in a local, disposable Docker process,
uses verified TLS, preserves ACLs/policies, and includes public/application and
Drizzle migration schemas. It creates no database. Plain export bytes stream
directly into AES-256-GCM with a random nonce and authenticated version header.
Only a complete encrypted file is published. Verification decrypts into a private
0700 staging directory/0600 file, authenticates the entire stream, then inspects
its PGDMP header and archive table of contents. Plaintext is removed in `finally`.
Never pipe unauthenticated plaintext into `pg_restore`.

The `.sfbackup` file and `.json` manifest remain private and Git-ignored under
`.recovery/`. Keep both; verify the encrypted SHA-256 before remote upload or
restore. A copied artifact without its recoverable key is not a recovery plan.
New manifests use authenticated format two. Call `verifyRecoveryFiles` from
`scripts/recovery-manifest.mjs` before `openArchive`; it verifies the descriptor's
HKDF-separated HMAC, canonical filename, age under 30 days and exact encrypted
size/hash. Never change the signed creation time to make an old copy eligible.
Unsigned format-one manifests from the initial local drill are not accepted by
this production verification path. Archive AES-GCM framing remains version one.
Use `pnpm --filter @snapform/database bootstrap:backup` with local migration
configuration to provision the private SELECT-only snapshot identity. It
preserves `.env.backup`'s existing archive key and never silently rotates a live
login. Verify permissions with `pnpm --filter @snapform/database verify:backup-role`;
the operator probe rolls back its synthetic changes. Exports use
`node --env-file=.env.backup scripts/backup-postgres.mjs`, never the owner URL.
The tool refuses foreign/pooled targets and existing output files; diagnostics
are fixed events without connection URLs or provider error details.

`pnpm test:recovery` runs offline tests without Docker, a database or credentials.
It covers streamed binary roundtrip, mode-0600 output, header/ciphertext/tag
alteration, truncation, wrong keys, no premature plaintext publication, preserved
existing files, cleanup on input failure, secure connection targets and sanitized
malformed-URL errors. These tests run in the normal test/CI command.

The 30 October operator export authenticated and produced 190,162 encrypted
bytes with 22 table-data entries. Its SHA-256 is
`1b4c688c22fe79f8d3097f92b0cb60e595c84208c9acbf544e46b4ade9893a90`.
The user explicitly approved a scoped one-database-contract exception for a
throwaway local restore. The drill restored all 30 migrations and the saved
synthetic dataset in 2,066 ms, including typed zero/true answers. Actual restricted
runtime login saw zero unscoped responses and could not claim webhooks or delete
retention settings; actual Jobs login could claim webhooks but could not read
auth users. Network mode was `none`, with no published ports. The container and
plaintext directory were removed and their absence checked. This small logical
drill is not evidence for production RTO/RPO or an automated backup schedule.

For a fresh isolated restore, recreate the application owner and restricted
runtime/Jobs roles before loading preserved ACLs. The Neon archive also references
`neon_superuser` and `cloud_admin`: create inert NOLOGIN roles locally and grant
`cloud_admin` temporarily to the local restore owner so its archived default
privileges can be restored; revoke that membership immediately afterward. Do not
strip ACLs or grant runtime broad access to make a restore pass. Readiness must
query the target database; `pg_isready` can report ready during initialization
before that database exists. Preserve authentication and tenant-boundary checks.

R2 activation is complete. The private `snapform-backups` bucket expires
`archives/` after 30 days in storage; `snapform-purge-ledger` expires `intents/`
after 90 days. A signed 198,142-byte copy passed remote roundtrip verification
and a 2,000 ms isolated restore of all 31 migrations, including restricted role
attributes and typed synthetic values (evidence 0092).

Before opening restored traffic, replay **both** pending SQL purge intents from
the snapshot and retained authenticated R2 intents. An intent can remain pending
longer than the R2 lifetime; valid newer snapshots still contain it. Persist its
ledger record before finalizing, even during restore. Stop on conflicting
metadata or unavailable ledger storage. Deletion replay, automated backup
identity/schedule, independent key custody and actual alerts remain release gates.
The restore approval does not authorize another Neon database/branch or a
permanent local test database.
