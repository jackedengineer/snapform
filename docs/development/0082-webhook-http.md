# Webhook HTTP controls — 30 October 2026

Authenticated form routes now expose synthetic preview, explicit send, current
enablement and bounded delivery history. They keep the existing origin, write
rate, JSON/size, no-store and workspace authorization boundaries. Strict public
contracts reject supplied payloads/destinations and leaked response fields.
Send returns 202 Queued only after its database transaction commits. A fresh
private service-binding request carries only the versioned delivery UUID;
cookies, auth, URLs, answers and signing keys are never forwarded. Failed wakes
emit one sanitized event and leave the durable row for Cron recovery.

Tests first reproduced missing protected routes/body handling and missing browser
HTTP helpers. Five client tests now verify exact methods/bodies, private fetch
options and invalid-input/sensitive-output rejection. All 72 API tests pass in
workerd. A wake test also caught an implementation mistake before deployment:
Workers rejects `redirect: error` during Request construction. It now uses manual
redirects and rejects non-2xx wakes. Tests verify a fresh header allowlist and
sanitized thrown/503/302 failures. See [Cloudflare Request semantics](https://developers.cloudflare.com/workers/runtime-apis/request/).
Browser fetch retains its supported error redirect mode.

Two full API runs encountered intermittent live Neon connection timeouts; focused
lifecycle verification and the subsequent unchanged-limit full run passed. No
timeout, assertion, test database or failure threshold was relaxed. Types/lint,
builds and bundle checks pass: total JS 202.32 KiB gzip, inbox 160.76, API 736.92,
Jobs 231.29; other approved screen/CSS/font limits pass. No dependency added.
The UI and its normal/power/adversarial journeys are the next slice; actual
receiver delivery, timeout recovery and concurrent claim evidence remain gates.
