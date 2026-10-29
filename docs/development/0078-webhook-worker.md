# Private webhook wake and Cron — 30 October 2026

The Jobs entry now connects the native signed sender and durable dispatcher to
Cron, after the existing event/email work. A private POST `/dispatch/webhooks`
wakes one explicit delivery identity; Cron remains the fallback for pending
work. It accepts only the versioned UUID message, at most 512 streamed bytes,
and returns bounded counts. It accepts no destination, secret or response data.
There is no public Jobs route, workers.dev or preview URL; the public web/API
forwarding rule remains limited to the existing Resend callback. The API does
not yet produce these wake requests.

Tests failed first at the missing route module. All 33 Jobs tests now pass in
workerd, including the real private Worker boundary: GET 405, oversized POST
413, valid POST without database configuration 503. Unit boundary cases reject
query overrides, extra keys, invalid UUID/JSON, media types/encoding and stream
errors before dispatch. A failed-stream regression first reproduced a rejected
cancel overriding the intended validation reply; cleanup now emits a constant
sanitized warning and preserves rejection. Database failures return 503 without
private diagnostics. Completion counts are explicitly projected.

Types, formatting and lint pass; the Jobs dry-run build is 231.29 KiB gzip
(previous 219.83 KiB). This connects existing native crypto/payload code and adds
no dependencies or client bytes. Deployment still requires the same private
WEBHOOK_ENCRYPTION_KEY used by API and the real restricted Jobs login.
No new UI is exposed in this slice. Preview/send/history/retry browser checks,
an owned live receiver, timeout/rate-limit recovery and concurrent connection
exclusion remain pending before this feature is considered ready.
