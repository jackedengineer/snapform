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

Live access is not yet verified. A dedicated Object Read only key scoped to this
bucket, private configuration and encrypted CI secrets await explicit browser
approval. Snapshot-only verification still cannot reopen traffic; complete SQL
replay/quarantine and authoritative quiescence remain unfinished. No browser
feature or live purge is enabled by this slice.

Cloudflare documents [bucket-scoped S3 Object Read only tokens](https://developers.cloudflare.com/r2/api/tokens/).
The XML reader's [documented parser](https://github.com/rgrove/parse-xml) does not
resolve external DTDs/entities; this client additionally rejects DOCTYPE.
