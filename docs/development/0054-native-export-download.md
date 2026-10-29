# Native export download — 29 October 2026

The inbox uses an authenticated same-origin download link. The web Worker verifies
successful CSV type, bounded declared length, complete status and the UUID/version
attachment filename before forwarding a browser navigation. Other responses
become styled, script-free recovery pages. API JSON clients keep the original
response. Error pages preserve auth cookies/request IDs, remove attachment/body
representation/redirect headers, use no-store and a narrow CSP, and never reflect
API body text. The return action uses validated path identities. Native browser
downloads keep the application open and avoid a second Blob/fetch implementation.

Tests preceded the new boundary; the real preview initially returned JSON rather
than its expected HTML authorization recovery. Four boundary tests cover complete
CSV bytes, permissions/rate/size errors, cookie preservation, invalid media types,
empty/oversized/partial files, redirects and unchanged JSON clients. The format
regression accepted a CSV-like media-type prefix before the strict comparison.
The native link helper test failed before implementation and proves encoding and
a fixed origin. Existing form requests keep their behavior with shared path
construction. The preview smoke check passes through the actual web/API binding.

Browser evidence at 1146×804: the native link saved an exact 576-byte CSV in
Downloads, verified byte-for-byte against the scoped Worker response. The browser
event waiter did not report that popup download; the newly written known file and
its contents were independently verified. Repeated requests reached the real
three-per-minute guard and returned a recovery page; Back to inbox worked.
A forged query field rendered an unavailable page without answer content. The
final recovery card has a 126px action, no horizontal overflow and zero scripts.
The first visual pass found a full-width action and it was corrected. Screenshot
`47-export-recovery.png` contains no answers. Files containing answers stay outside
Git. Console warnings/errors were empty. Mobile and live production checks remain
pending; the native Mac is locked and viewport overrides did not change width.

Final emitted assets: 199.70 KiB JS gzip / 200 budget, 7.66 KiB CSS / 20,
36.07 KiB font / 40. Query modules and pure contract/request helpers are grouped;
no editor UI is pulled into the homepage to satisfy a size check. No dependency
was added. API dry-run is 727.25 KiB gzip, jobs 216.26 KiB. Strict checks, 196 pure
and 65 API tests, 36 rollback database tests, SSR/reload checks and the production
audit passed. Core coverage remains 100% lines/functions, 99.58% statements and
97.95% branches. These measurements are not production latency SLOs.
