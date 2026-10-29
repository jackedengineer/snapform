# Signed provider receipt contracts — 29 October 2026

Native Web Crypto verifies HMAC-SHA256 over the exact message ID, timestamp and
raw body using the documented Svix format. The receiver enforces a five-minute
clock window, 32 KiB UTF-8 body limit, bounded ID/signature sizes and at most eight
signature candidates. Version-one signatures support provider key rotation;
malformed material fails closed. Production callers use the current clock.
The historical clock argument and public fixture keys exist only for tests.

Three tests failed before the verifier existed, then passed against Svix's
published vector, body/header tampering, stale/future timestamps, missing headers,
bad keys, oversized UTF-8 and rotating signature lists. Two projection tests cover
all six supported email outcomes, unknown/untagged mail, extra provider fields and
malformed tagged metadata. Only delivery/provider IDs, the snapshot recipient and
normalized status leave the parser; subject/body/diagnostics are discarded.

The full 206-test pure suite passes. Coverage includes both new modules and remains
100% lines/functions, 99.61% statements and 98.17% branches. No dependency was added;
Zod is already owned by the contracts package and signatures use native crypto.
These modules are server-only consumers and do not increase client assets. Worker
forwarding, persistence and live provider configuration are a separate slice.

Sources checked:
- https://docs.svix.com/receiving/verifying-payloads/how-manual
- https://resend.com/docs/webhooks/verify-webhooks-requests
- https://resend.com/docs/webhooks/event-types
- https://resend.com/docs/webhooks/emails/delivered
