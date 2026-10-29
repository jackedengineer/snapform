# Webhook payload and native transport — 30 October 2026

The version-1 JSON envelope pins event/form/response/version/time identities and
ordered effective fields, with explicit answer state, typed value and display
text. The existing evaluator rejects incomplete/foreign-field snapshots. Zero,
false, blank, choice IDs/labels and deterministic bytes are tested. A test event
has webhook.test type and test=true; a receiver must exclude it from real actions.
No capability, definition/rule object or raw operational diagnostic is included.

The first unexposed signing primitive used a 256 KiB body bound. A failing test
showed it could not cover the collector's already supported 2 MiB answer envelope.
The protocol now permits 3 MiB for answers plus bounded field/display metadata;
it never truncates. The previous oversized-input test now checks that bound, and
full collector-sized signing/verification passes in Node and actual workerd.
No quality/coverage/client-bundle constraint changed. This is a functional bound
alignment before transport activation, not evidence that all large jobs meet a
production CPU/latency budget.

The native sender creates a fresh POST with only fixed protocol headers, exact
persisted bytes and a ten-second AbortSignal. It uses the three Standard Webhooks
headers, stable event ID and a fresh timestamp per attempt. It follows no
redirects and cancels unused response bodies. A 2xx acknowledges the endpoint,
not downstream business success. Redirects/authorization/configuration failures
stop; 429/5xx use bounded exponential jitter and Retry-After. A requested pause
over a day stops automatic retries rather than sending earlier. A failing
nine-digit Retry-After case caught an ignored-long-number bug and now passes.
Eight attempts is the ceiling. Network errors and 408 are Unknown, requiring
explicit safe replay/reconciliation rather than an exactly-once claim.

Jobs explicitly enables global_fetch_strictly_public and has no origin/VPC/
private network binding. URL registration policy complements that connection
boundary; no redirect, incoming auth header, cf override or customer-supplied
header set is forwarded. Sources: [Cloudflare compatibility flags](https://developers.cloudflare.com/workers/configuration/compatibility-flags/#global-fetch-strictly-public),
[fetch](https://developers.cloudflare.com/workers/runtime-apis/fetch/) and
[Standard Webhooks](https://github.com/standard-webhooks/standard-webhooks/blob/main/spec/standard-webhooks.md).
Workerd tests use fake transports, never private/unrelated network targets.
They establish runtime protocol behavior, not a live DNS or ten-second timeout
rehearsal. No sender is connected to Cron or a browser action yet.

Verification: 24 Jobs Worker tests; 223 pure tests (99.81% lines, 100% functions,
99.36% statements, 97.97% branches); types/lint, generated Jobs types, production
build and bundle checks. Client remains 201.98 KiB gzip; API 732.96/Jobs 219.83 KiB.
The sender/payload are not production entry-point imports yet. No dependency.
Local Node 24 warm measurements, 5 warmups plus 20 samples: standard 953 bytes,
p50/p95 0.28/0.70 ms; 50 full-length Unicode fields 3,007,174 bytes, 24.46/30.41 ms.
These measure validation/encoding/signing only, not network/DB/SLO performance.
Durable leases, stored exact payloads, preflight/send controls and owned live
receiver/browser tests remain required before outbound delivery is complete.
