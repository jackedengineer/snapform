# Private, verified backup transfers

The transfer is restricted to the Cloudflare account's HTTPS R2 endpoint,
`snapform-backups` bucket and canonical `archives/` filenames. It supports only
GET and conditional PUT, requires exact 200 receipts and refuses redirects.
Archive publication precedes the signed descriptor. A downloaded pair must pass
signature, creation-age, encrypted-byte-count and SHA verification before success.
Uploads are immutable; a collision is an explicit failure, preserving remote
bytes. Failed downloads remove only files/directories created by this operation.

Existing curl supplies maintained TLS/SigV4 support. Native Node starts it with
`-q --config -`; private credentials travel over stdin, not process arguments.
Verbose/provider diagnostics are suppressed. Downloads have independent stream
byte bounds in addition to curl limits and timeouts. No SDK or application
runtime dependency is added. A shared canonical filename rule prevents divergent
path validation between signed descriptors and remote transfers.

An independent test writer reproduced the refused-download failure path before
its fix: an existing destination could be deleted after exclusive-open refusal.
The fix obtains exclusive ownership before creating the output stream and only
removes that owned output. Nine process-boundary/config tests pass using a private
fake curl process, including credentials/arguments, publication/download order,
collisions, 403, oversize/truncated/altered bytes, tampered descriptors, expired
archives and cleanup. Existing archive/manifest tests remain intact.

The later live scoped-key roundtrip passed with 201,666 encrypted bytes and
23 table-data entries; see 0101. Reads of the purge-ledger bucket and bucket
administration returned 403. No broad Wrangler OAuth credential enters CI.
Hosted invocation, scheduling, automated restore/replay, independent key
custody and freshness alerts remain open gates.
