# Response inbox interface — 29 October 2026

The editor links to a dedicated response inbox. Lists use bounded keyset pages;
selected responses have bookmarkable UUIDs and immutable published questions.
Queries are scoped by verified user/workspace/form/response identities and cleared
by the existing account sign-out boundary. Loading, reconnect, empty and missing
response states are explicit. Native links, buttons, time elements and definition
lists provide keyboard navigation and text-safe answer display. Zero, false,
blank, refused and not-applicable remain distinct; choices use published labels.
The shared pure formatter is covered by behavioral tests.

Browser results at an actual 1146×804 desktop viewport: normal navigation from
workspace to editor to inbox passed; versions 1 and 5 displayed their original
questions; an empty form displayed its collection guidance. Power-user keyboard
selection, repeated refresh and full refresh preserved the chosen response.
An unrelated UUID displayed an unavailable state with no prior answers. Stored
HTML-like text produced zero image elements and no alert. DOM checks found no
horizontal overflow or unnamed controls; console warnings/errors were empty.
The response heading receives focus after selection. No screen-reader or real
mobile-device run is claimed. The requested 375px viewport override did not alter
actual width in either browser; native Mac control reports the Mac is locked.
Responsive verification remains pending the user's unlock. Empty-state evidence
is committed; screenshots containing answers remain private outside Git.

No dependency was added. Client JS is 199.98 KiB gzip, CSS 7.58 KiB and the font
36.07 KiB. Grouping pure contracts/request code saved enough duplicate chunk
compression overhead without pulling editor UI into the homepage. A rejected
editor/framework grouping was discarded. The homepage's emitted static import
and preload graph measured 117.33 KiB gzip; this is an artifact estimate, not a
network or usability SLO. Build, strict checks, 187 pure tests, 64 API Worker tests,
36 database tests and SSR/reload checks passed. Mobile verification and production
smoke testing are still required before the inbox release gate is complete.
