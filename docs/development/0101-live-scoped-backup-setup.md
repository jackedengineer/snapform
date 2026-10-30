# Live scoped backup setup

The user approved the scoped Cloudflare/GitHub setup and temporarily enabling
Chrome Apple Events JavaScript. REA could not safely capture a generated key,
and macOS denied System Events automation. The user enabled the browser option;
subsequent operations used capture-free Apple Events with private Node pipes.
Only a newly created setup window was used; existing dashboard tabs were kept.
No generated-key screenshot, accessibility snapshot, credential argument or chat
output was produced. The generated-key panel was cleared after private saving.

The new account token, Snapform backup automation, has Object Read & Write only
for `snapform-backups`. The dashboard listed it active with that exact bucket and
permission. Credentials are stored in an ignored 0600 file. A real restricted
snapshot export through the new curl/R2 path passed upload and exact download
verification: **201,666 encrypted bytes, 23 table-data entries**. This validates
the new transfer path separately from the earlier Wrangler-only roundtrip.
Negative reads against the owned purge-ledger bucket and bucket-administration
listing both returned 403, confirming those operations are outside this key.

The four approved Actions secrets were sealed with the repository's public key
using GitHub's documented PyNaCl/libsodium method and saved successfully:
DATABASE_BACKUP_URL, BACKUP_ENCRYPTION_KEY, R2_BACKUP_ACCESS_KEY_ID and
R2_BACKUP_SECRET_ACCESS_KEY. The database identity is the SELECT-only backup role;
existing archive key material was preserved. No migration-owner secret or broad
Wrangler OAuth credential was uploaded. The one-time PyNaCl 1.6.2 environment is
operator tooling, absent from application dependencies and bundles.

The workflow remains manual-only, pending a hosted invocation, automated
isolated restore/replay, independent key-custody verification and freshness/failure
alerts. Existing logical restore evidence does not prove the complete new CI
path. The user restored the browser option to disabled; a capture-free probe
confirmed that state. Only the owned setup window was closed, and temporary
browser/encryption helpers were removed. Existing tabs and private keys remain.
