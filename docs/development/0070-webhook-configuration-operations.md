# Webhook configuration operations — 30 October 2026

Authorized owner/editor configuration reads and saves now use the existing
workspace transaction boundary and serialize on the form's draft row. Saves
require the current revision, generate a fresh server-side signing key, encrypt
it with the destination and insert a new configuration. They select that version
with delivery disabled. Old destinations/keys remain unchanged. A lost save
response requires refreshing current state before retrying a conflicting save.
No save performs network I/O or claims endpoint verification.

The strict shared input permits only configurationId, URL and expectedRevision.
It canonicalizes public HTTPS URLs/UUIDs and rejects enabled, secret, verifiedAt,
invalid revisions and unknown properties. Read projections include URL and
verification metadata for authorized integration managers, without the key or
ciphertext. Viewers cannot read endpoint capabilities, even after forging the
transaction's role hint; actual membership remains authoritative.

The configuration test was written before its module existed (initial import
failure), then exercised against real restricted Neon transactions. Expected
and observed: absent settings off/revision 0; save revision 1; stale save conflict;
unsafe URL rejected; encryption independently opens only in its bound context;
replacement revision 2 stays off and leaves the old encrypted row byte-identical;
viewer denied, foreign actor hidden. Fixture identities/configurations roll back.
Full database suite: 45 pass. Pure suite: 216 pass with 100% lines/functions,
99.66% statements and 98.26% branches. Formatting/types/lint, build and bundle
checks pass; no runtime dependency or production entry-point import was added.

This remains an internal slice. The HTTP boundary, explicit signing-key reveal,
preflight/delivery lifecycle and browser controls must follow before webhooks
can be described as usable or production-ready. Existing browser release smoke
evidence is separate in 0069, not evidence for these unexposed operations.
