# Versioned response CSV — 29 October 2026

Owners/editors can export a specific published version; viewers remain read-only.
The database repeats tenant/capability checks, first reads at most 1,001 metadata
rows, and refuses more than 1,000 responses or 1 MiB of stored answer JSON before
loading answers into Worker memory. It captures exact response identities and
rejects concurrent removals instead of silently returning a partial export.
Only finalized responses from the requested workspace/form/version are included.
No migration or additional database was needed.

CSV columns include response reference, UTC timestamp, publication number and
published question labels with stable field UUIDs. Number units are retained in
headers; numeric zero and booleans remain typed. Every answer has a separate state
column. Strings are quoted, embedded quotes doubled and formula/control/full-width
initiators prefixed as text, including question headers. Output is UTF-8 with a
BOM and CRLF records, capped at 2 MiB without silent truncation. As documented by
[OWASP](https://community.owasp.org/attacks/CSV_Injection), no escaping convention
is universal across spreadsheet applications and later save/re-open conversions;
no spreadsheet application interoperability run is claimed here.

The authenticated GET endpoint rejects unknown query fields and cross-origin
browser requests, uses an independent three-per-minute actor limit, and returns
an attachment filename made only from a validated form UUID and version number.
It logs a bounded row count and request UUID, never answers, credentials or raw
provider messages. The app/API credentials and query rules are unchanged.

Behavioral tests failed before the encoder/query/endpoint existed and pass now.
A regression test caught missing currency units, then another caught a MIME-type
prefix accepted by the native web download boundary; both are fixed. The real
rollback-only database test proves pinned definitions, exact exported records,
unknown versions and viewer rejection. A real local web-to-Express Worker probe
produced 576 CSV bytes with reference, zero, boolean and state columns, and rejected
unknown fields (422), cross-origin requests (403) and anonymous navigation (401).
One local sample took 1,204 ms; it is not a p95 latency measurement. The outer HTTP
proxy streamed without Content-Length; the API's declared size is checked at the
internal boundary and the final file's exact bytes were checked separately.

The in-app browser saved a 576-byte file that matched the Worker response byte for
byte. Repeated native downloads reached the rate limit and displayed a recovery
page; returning to the inbox worked. CSV files/screenshots containing answers
remain outside Git. Browser/mobile/deployment evidence for the native download
page belongs to the following UI slice; mobile verification remains blocked by
the locked Mac. Large asynchronous/R2 exports are not implemented by this slice.
