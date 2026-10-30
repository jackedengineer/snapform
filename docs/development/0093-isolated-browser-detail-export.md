# Owner detail/export browser extension — 30 October 2026

## Scope and privacy

Extended [0091](0091-isolated-browser-smoke.md) against the existing owned
synthetic QA form on `https://snapform.jacked.dev`. REA 6.5.0 controlled Chromium
`156.0.8078.76` in a fresh isolated profile created only for this pass. The CLI
used documented connect mode against that owned browser's private loopback
endpoint. Existing dashboard profiles were untouched.

The already proven child-only environment secret references supplied QA login
credentials. Entire CLI stdout/stderr was checked for both credential strings
before inspection: neither appeared. No response DOM, accessibility text,
screenshot or network body was captured. Declarative locator waits checked the
known synthetic values without exporting answer content. Header values and
storage capture remained off. No token, session capability, credential, raw
answer or CSV contents were written to repository evidence.

No settings were changed, no data deleted, and no email/webhook test or retry
was triggered. Each authenticated run signed out successfully before its owned
browser process was terminated and temporary profile/inputs removed.

## Actual owner workflows

| Mode                | Expected                                                                                       | Observed                                                                                                                                                                                                     |
| ------------------- | ---------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Normal owner        | Select the existing synthetic response and see the original typed values represented correctly | Keyboard activation selected the known response; detail GET returned 200. Declarative visible waits matched the number ending in zero and the boolean presentation “Yes”. No answer artifacts were captured. |
| Power owner         | Refresh retains the selected response and zero value                                           | Enter on Refresh issued response-list and detail GETs, both 200; the visible zero assertion still passed.                                                                                                    |
| Power owner         | CSV link starts a version-specific download safely                                             | Enter on the export link produced a `download-cancelled` event for the form's v1 CSV and the expected `snapform-…-v1.csv` filename. The main inbox remained usable.                                          |
| Adversarial owner   | Unknown/malformed response IDs show an error without exposing another response                 | A valid unknown UUID and `not-a-uuid` each returned detail 404 and displayed a visible response-detail alert. List GETs continued to return 200. No raw answer capture occurred.                             |
| Normal/power mobile | Inbox is readable and controls remain visible                                                  | Final 375×812 PNG shows the title/intro wrapped within the viewport, visible Sign out and Refresh, contained settings panels and response rows. Keyboard sign-in and sign-out succeeded.                     |
| Session cleanup     | Sign-out completes before termination                                                          | Every protected run received sign-out 200 and reached the login form. REA disconnected; the harness then terminated its own Chrome process and removed its temporary profile.                                |

There were no JavaScript page-error events in these owner scenarios. Browser
resource console errors associated with the two deliberate detail 404s were
expected. The observed API detail/list refreshes returned 200; this does not
establish a latency distribution or eliminate every possible timeout.

The browser download was deliberately cancelled by REA. Installed REA launch
configuration sets `acceptDownloads: false`; its download listener records
sanitized URL/filename metadata and calls `download.cancel()`. No file contents
were retained. The popup's HTTP export response status was not captured, so this
pass proves UI download initiation, not CSV content integrity, header correctness
or complete transfer. Parent native HTTP export verification is separate.

An `Alt+ArrowLeft` page-key attempt left the selected-response URL unchanged.
It is recorded as an inconclusive browser-history test, not a successful Back
check or a product regression. REA exposes declarative navigation/keys but no
browser-history action in the installed scenario schema.

## Mobile capture setup

Only [71 — mobile inbox](../evidence/71-isolated-chrome-inbox-375-app.png) is
retained from this extension. It contains response references/dates/version,
with no selected response or QA email. No login screenshot was requested.
The retained image was recreated during the later retention QA after a harness
filename collision. Its source is `ev_ded45d6bcda6d8d7ee24170a74437647b10f734e4d5335cdedbf0bbb7edfe91a`,
with sign-out `ev_8f551e0cf7d2a461b99990df819b28d54e03c5c65ee8df7da501f0246d7198ab`.
The earlier flow assertions and original capture IDs below remain separate evidence.

Two initial connect-mode captures had a 375px output PNG while the ordinary
Chrome window supplied a wider layout. An explicit narrow window changed the
breakpoint but still cropped the layout. A fresh owned Chrome **app window**,
created with the narrow window dimensions, produced the final correctly wrapped
capture. The two misleading setup images were discarded. This difference is a
capture/window limitation; those images do not establish a source defect.

The configured scenario viewport and final PNG are 375×812. No documented safe
geometry-evaluation operation was available in the selected REA workflow, so
this note does not claim measured CSS layout/visual viewport dimensions or
numerical overflow bounds. The final screenshot was visually inspected. It is
not a real-device or complete accessibility certification.

## Collector challenge observation

One bounded follow-up used REA launch mode, explicitly **headless**, at 375×812
on the public synthetic form. Waiting 15 seconds for the start button to enable
timed out; the button remained disabled. There were zero Snapform POSTs and no
respondent session/submission was created. No token was read, synthesized or
bypassed; no further collector retry was made.

Passive metadata showed Turnstile `api.js` returning 302 followed by a script 200. Challenge documents/scripts and challenge POSTs returned 200. One
challenge-origin fetch returned 401, and one fetch to
`hagen.challenges.cloudflare.com` was aborted. Console CSP errors came from the
`challenges.cloudflare.com` document about `data:,` connections; no Snapform
resource/CSP failure or JavaScript page-error event was recorded. No visible
Turnstile error code appeared. Opaque challenge URLs, request bodies and tokens
were excluded from this note.

The challenge script loaded, so this evidence does not demonstrate a missing
Snapform script or first-party CSP denial. An unresolved headless challenge is
a plausible explanation, not a proven sole cause. Completing the real collector
submission remains unverified in this extension and requires a browser that
successfully completes the genuine challenge.

## Evidence identifiers

| Scenario                                       | REA evidence ID                                                       |
| ---------------------------------------------- | --------------------------------------------------------------------- |
| Owned inbox; initial connect capture           | `ev_3d0e4864c5cd10c90c3871fee0ab1367a85c28e38d772fc33bda99e8ef5a0c56` |
| Detail, refresh, export, unknown/malformed IDs | `ev_965592f2908a12007ef3efcf0038be8f54a842c2a36172075724c85813bef616` |
| First owner run sign-out                       | `ev_0266b905424b1f84beb0efa6ab5c2101695f86c8248ecfb9244a2d7a50142ee1` |
| Explicit narrow-window setup                   | `ev_c4580137c30bb273fa59bba34b5ed98524a5a7730b2964876af280bfe114f66f` |
| Narrow-window sign-out                         | `ev_9529f8dae2fc1aa6997bea9e4ad7815c37e869b444336b2a136f5e5b8dce42c6` |
| Final app-window inbox / screenshot 71         | `ev_87ff0a592485096fe95ab5446c94f318fface3668955bc69a5a8b3b641df3b21` |
| Final app-window sign-out                      | `ev_81f354a228dedfae1b7c5557a87ffcee1c84550fb3b4aa93ff7cd6e5deafa97c` |
| Collector bounded challenge wait               | `ev_ade3ce0d41316411e1f8b27be296abefba55449eb2db723320bb4198179f3643` |
