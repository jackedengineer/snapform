# Owner email provider boundary — 29 October 2026

The sender produces one stable plain-text payload and idempotency key per delivery.
It targets Resend's fixed HTTPS API and includes only the recipient, a fixed subject,
response reference and authenticated production inbox URL. It never includes answers,
form titles, credentials or bearer links. A local allowlist can restrict test recipients.

Four workerd tests failed before implementation and now cover identical retry bytes,
recipient/header injection, missing settings, expiry, provider timeouts, 408/429/5xx,
concurrent idempotency conflicts, permanent errors, redirects and malformed/oversized
success bodies. Provider reads are limited to 8 KiB and requests to ten seconds.
Retry-After is bounded to 60–3,600 seconds. Uncertain outcomes reuse the same key;
after 23 hours the sender requires attention rather than risking a duplicate after
the provider's documented 24-hour window. Accepted does not mean delivered.

The runtime tests exposed an actual platform mismatch: Workers rejects redirect:error
at Request construction. The sender now uses redirect:manual and rejects redirects,
so credentials cannot follow a Location header. This is documented by Cloudflare.
No provider body, recipient or key is returned in an outcome or logged.

Strict checks and the four focused Worker tests pass. No dependency was added.
This module is not wired into the scheduler yet, has sent no live email, and adds
no client assets. Claims, durable results, visible status and signed provider
receipts remain required before the notification feature is released. The existing
browser journeys are unaffected by this internal boundary.

Sources checked:
- https://resend.com/docs/dashboard/emails/idempotency-keys
- https://resend.com/docs/api-reference/errors
- https://developers.cloudflare.com/workers/runtime-apis/request/
