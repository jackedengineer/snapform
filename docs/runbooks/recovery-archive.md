# Encrypted logical recovery archive

Neon point-in-time recovery is the primary database recovery mechanism. A
logical archive is an additional independent recovery copy, not a replacement
for WAL/PITR or the five-minute RPO target. PostgreSQL's consistent export does
not by itself establish full production recovery. [PostgreSQL pg_dump](https://www.postgresql.org/docs/current/app-pgdump.html).

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

Reapply the durable purge ledger before opening restored traffic. R2 upload,
expiry controls, automated backup identity/schedule, independent key custody and
actual alerts remain release gates; R2 activation currently needs the user's
secure payment-method setup. The restore approval does not authorize another
Neon database/branch or a permanent local test database.
