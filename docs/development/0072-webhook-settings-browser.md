# Webhook settings browser slice — 30 October 2026

Native disclosure/form controls use the existing design tokens and TanStack Query
for metadata/mutations. Signing-key reveal uses component memory and an abortable
request, not query caching or persistent browser storage. Closing, editing,
saving or replacing the form clears it. Only integration managers see controls;
the API and database enforce permissions independently. Saving stays off and
requires the current revision. No webhook request is sent by these controls.

The manual browser case was recorded before implementation: the owned local
inbox had no Signed webhooks control. Normal-user verification then saved a
synthetic HTTPS endpoint, observed canonical host/default-port normalization,
off state, focus on the saved status and persistence after reload. Explicit key
reveal/hide worked; checks returned booleans rather than printing the key.

Power-user verification: three rapid Enter presses caused one additional version
(read-only Neon count/revision 1→2), still off/unverified. Markup-like query text
was encoded and inert. Closing during reveal and reopening through the keyboard
left no key in the DOM and required another explicit reveal. Field→Save tab order
worked. Actual DOM widths 320/768/1024/1440 showed no horizontal overflow or unnamed
inputs; one main and zero duplicate IDs were checked. Console warnings/errors
were empty. Screenshots [mobile](../evidence/55-webhook-settings-mobile.png) and
[desktop](../evidence/56-webhook-settings-desktop.png) contain no keys/answers.
These are browser emulation/DOM/keyboard checks, not real-device or screen-reader
certification. Full-document captures were taken at scroll top to avoid the
capture tool placing offscreen fixed elements into the document image.

Adversarial verification: the real authenticated local Worker boundary returned
422 for encoded loopback, forged enable and query overrides; 409 for stale save
and wrong key identity; 404 foreign workspace; 403 foreign-origin reveal; 405
wrong reveal method. No-store metadata exposed no key/ciphertext. All rejected
probes preserved configuration and the temporary auth session was signed out.
Database privilege/tenant rejection tests remain rollback-only.

The browser caught a raw Zod error in unsafe-URL feedback. A failing regression
test now requires a useful message and zero client save requests; it passes.
A new attempt clears old feedback, and invalid input needs no network refresh
before editing again. Settled browser state confirmed the plain error, focus and
editable input. Saves stay serialized rather than blindly retried.

Full pure suite: 220 pass, 100% lines/functions, 99.67% statements, 98.30% branches.
API suite: 69 pass; real DB suite: 45 pass plus the extended key-reveal case.
Types/lint and production build/bundle gates pass. Real three-Worker preview
checks pass for SSR/CSP, Express ingress, export authorization and signed-provider
receipt rejection. Client JS 201.98 KiB; inbox 160.43, home 119.34, collector 160.17,
editor 182.42; CSS 7.97/font 36.07 KiB. No dependency was added.

Preflight preview/send, durable attempts, endpoint acknowledgement, failure
history and safe retry are still pending. These controls do not complete outbound
webhooks or the six-workstream release. Production encryption secrets and this
UI have not been deployed yet; existing main release remains documented in 0069.
