# Bounded read-only R2 ledger client

1 November 2026. The recovery reader uses native curl signing/TLS with private
stdin configuration. Its only bucket is `snapform-purge-ledger`; object paths must
be `intents/<uuid>.enc`. It exposes GET operations, never write or administrative
operations. Credentials, provider bodies and parser excerpts do not enter logs.

Listings are bounded to 1 MiB, objects to 4 KiB, pages to 20 and distinct objects
to 10,000. Four reads run at a time. All pages are collected before object reads;
cursor loops, repeated keys, an injected initial cursor, malformed XML and
unexpected prefixes fail closed. The supported XML dialect uses the standard
unprefixed S3 default namespace. Foreign/prefixed namespaces and misplaced
Contents/Key nodes are rejected rather than silently omitted. A reviewer found
the prefixed-Contents omission; regression tests failed before that fix.

All four focused tests pass, including native subprocess pagination, 403,
oversized/missing responses and credentials absent from process arguments.
All 36 recovery tests, fast checks, build and bundle gates pass. The browser
artifact remains 208.05 KiB JS gzip, CSS 8.59 KiB and font 36.07 KiB. The exact,
zero-dependency XML package and measured Node-only cost are documented in
`docs/dependencies.md`; the generated lockfile adds only that package.

The production dependency audit is clean. The broader tooling audit identified
four high and five moderate findings in the existing development `undici` path;
the parser adds no such dependency. Address those in a separate focused update.

After explicit approval, the dedicated **Snapform purge ledger reader** account
token was created with Object Read only access to `snapform-purge-ledger`.
Its live signed list returned zero objects, matching the dashboard; an absent
synthetic UUID returned the expected missing-object result. Positive ciphertext
retrieval remains unexercised because the bucket is empty. The backup key's
separate bucket scope was not expanded.

Private `.env.r2-purge` is ignored and mode 0600. GitHub's repository Actions
secrets list visibly confirms `R2_PURGE_ACCESS_KEY_ID`,
`R2_PURGE_SECRET_ACCESS_KEY` and the existing stable `PURGE_LEDGER_KEY`.
No values were included in screenshots, Git or logs. Cloudflare's secret-name
list also confirms the key on `snapform-jobs`; this secret-only deployment is
version `7fe3f6b2-11ec-4627-8575-3a1cf0f36d12` (deployment
`601a933f-76a4-4a61-b50c-2c70d09942ed`). No purger code was uploaded or enabled.

The independent Bitwarden EU secure note **Snapform — production recovery keys**
contains the stable backup, purge-ledger and webhook encryption keys. All three
saved values were compared with private local configuration without displaying
them in evidence. The view was closed before capturing the note-list screenshot.

Snapshot-only verification still cannot reopen traffic; complete SQL
replay/quarantine and authoritative quiescence remain unfinished. The scheduler
activation flag remains `0`; this setup does not authorize enabling purge.

Cloudflare documents [bucket-scoped S3 Object Read only tokens](https://developers.cloudflare.com/r2/api/tokens/).
The XML reader's [documented parser](https://github.com/rgrove/parse-xml) does not
resolve external DTDs/entities; this client additionally rejects DOCTYPE.
