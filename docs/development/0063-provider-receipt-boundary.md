# Provider receipt boundary — 29 October 2026

The public web route forwards the untouched provider request through the API to
the private jobs Worker. Signature verification precedes JSON parsing and any
database connection. Only the jobs login can execute the new fixed-search-path
status function; runtime cannot. Signed, tagged events match the delivery ID,
recipient snapshot and provider ID. Unattempted work cannot become delivered.
Duplicate/lower-priority events are acknowledged without changing history;
complaints and failures cannot be downgraded by late acceptance events.

The new forwarding test failed with 404 before implementation. Worker tests cover
exact raw body forwarding, signatures, methods, content encoding/type, byte bounds,
unrelated/malformed mail, duplicate outcomes and sanitized retryable persistence
failure. The restricted database test failed before the function existed, then
passed. Operator fixtures prove ordered/duplicate/mismatched outcomes and roll
back every synthetic write. Migration 0022 adds only the function and its grant;
its generated table snapshot is identical to 0021. No applied migration changed.

Actual production preview checks passed across all three local Workers: unsigned
POST 401, GET 405 with Allow POST, no-store and empty bodies. A correctly signed
local fixture callback reached the real jobs database login and returned 204 for
the owned cancelled, unattempted QA delivery; read-only before/after projections
were identical. Browser navigation to the 405 endpoint shows the browser's HTTP
error page, with no application data. Inbox controls retain the prior slice's
normal/power/adversarial evidence; this slice adds no user-facing control.

All 206 pure, 67 API Worker, 19 jobs Worker and 41 database tests pass. A first
uncapped concurrent Worker run timed out an existing public-form check; its
focused tests passed, and capping local test workers at two passed the complete
suites with unchanged per-test timeouts/assertions. Multi-Worker development cold
start also exposed an overly short 500ms readiness probe. Readiness now has a
fixed 30s overall deadline and up to 5s per request (previous worst case 45s);
both reloads and three real auth cleanup cycles then passed on API port 8797.
Unrelated servers on ports 8787/9230 were untouched.

Build/type checks pass. Emitted client assets remain 199.92 KiB gzip JS,
7.85 KiB CSS and 36.07 KiB font; API/Jobs dry-run gzip sizes are 729.59/219.83 KiB.
No dependency was added and no budget was changed. CI uses the published fixture
signing key and an empty jobs database URL, never a live sender or jobs credential.

The user approved creating the six-event Resend webhook and private signing-key
storage. Its dashboard shows Enabled; the secret is masked and stored privately
and in Cloudflare jobs secrets. Sending is initially restricted to the approved
owned QA address. Deployment, a real delivery receipt and manual repair remain
release gates; creating the webhook alone does not establish email delivery.
