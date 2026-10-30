# Manual backup workflow and activation gates

The reviewable workflow at `.github/workflows/backup.yml` checks out pinned
actions and Node 24, runs the native recovery tests, then invokes
`scripts/backup-to-r2.mjs`. It installs no package or additional SDK. Only the
export step receives secrets. It requires the restricted snapshot reader,
existing canonical encryption key and bucket-scoped R2 credentials. Owner
credentials are rejected. Missing/invalid remote configuration fails before
export. Native temporary directories and ciphertext downloads are removed on
success or failure; no backup is uploaded as a GitHub artifact.

The workflow is manual-only. Enable a nightly schedule after a real scoped-key
roundtrip, automated isolated restore/replay, independent key custody and
freshness/failure alerts pass. A scheduled run can be delayed or dropped, so
success notifications alone cannot establish backup freshness.

Required encrypted repository secrets:

- `DATABASE_BACKUP_URL`: the existing SELECT-only `snapform_backup` login.
- `BACKUP_ENCRYPTION_KEY`: the existing archive key, preserved without rotation.
- `R2_BACKUP_ACCESS_KEY_ID` and `R2_BACKUP_SECRET_ACCESS_KEY`: Object Read & Write
  restricted to `snapform-backups`; no bucket administration or ledger writes.

The Cloudflare account ID is public configuration. The current local Wrangler
OAuth credential cannot list API-token permission groups (403) and is not a CI
credential. Bucket-scoped object credentials use R2's compatible object API,
not the Cloudflare administrative REST API. The approved scoped key and four
encrypted secrets are now configured; live transfer evidence is in 0101.
No credential belongs
in chat, source, process arguments, command output or diagnostic logs.

Sources: [Cloudflare authentication](https://developers.cloudflare.com/r2/api/tokens/),
[GitHub scheduled workflow limits](https://docs.github.com/en/actions/reference/workflows-and-actions/events-that-trigger-workflows#schedule).
