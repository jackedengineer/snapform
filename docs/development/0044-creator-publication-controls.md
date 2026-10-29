# Creator publication controls — 29 October 2026

The editor now exposes publication status, a stable public link, copy/open
actions and explicitly confirmed collection stop. Publishing flushes the last
edit and compares the validated saved definition before choosing its revision.
Requests retain their operation identity on uncertain failures. Definite
validation/conflict failures release the pending operation and reload status.
The editor is disabled while preparing or sending publication changes.

## Verification

- Normal: opened the dedicated synthetic project form, observed live version 2,
  copied its link, edited the description and immediately published version 3
  from saved revision 3. Final helper-backed build repeated this successfully
  with version 5 / source revision 6. Share identity stayed stable.
- Power: keyboard Tab moved from the readonly URL to Copy link; cancel and
  Escape closed the native stop dialog without stopping collection. Confirmed
  stop made the anonymous manifest return 404. Republishing restored collection.
  At 375 × 812, document width equaled viewport width with no horizontal overflow.
- Adversarial: blank title disabled publication with a specific diagnostic;
  a separate synthetic form containing a file field stayed blocked. A stopped
  unfinished response retained readonly recovery without a working submit path.
  Actual Worker tests cover unsigned requests, cross-origin writes, oversized
  bodies and malformed routes; real database tests cover stale/replayed publish
  and workspace permissions. No unrelated service/data was targeted.
- Three new preparation tests prove waiting for the last edit, rejecting an old
  saved definition and blocking invalid/file definitions; seven API transport
  tests include publication retries and definite 422 classification. Existing
  177 unit, 62 Worker, 26 database and three auth integration tests passed before
  this extraction; all ten affected transport/preparation tests then passed.
- Strict types, formatting, lint, production build, SSR/service binding,
  development reload/cleanup and dependency audit passed. Final assets: JS
  199.53 KiB gzip, CSS 6.97 KiB, font 36.07 KiB; no constraints changed.

Evidence: [mobile](../evidence/39-publishing-mobile.png) and
[stop dialog](../evidence/40-publishing-stop-dialog.png).

## Limits

Stop currently blocks new and unfinished responses until republishing; it is
not a graceful pause or permanent capability revocation. Those policies remain
separate work. No scanned files, embed, custom branding, automated accessibility
audit, independent screen-reader review or deployed-service claim is implied.
The local browser console contained no warnings/errors during publishing.
