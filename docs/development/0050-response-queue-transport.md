# Response event transport — 29 October 2026

The private `snapform-jobs` Worker relays bounded leased outbox batches to
Cloudflare Queues. Messages contain only a version and event UUID. Successful
publication records the fenced dispatch; failed publication backs off in Neon.
A minute Cron reconciles due records, including dispatched events without a
receipt after an hour. This does not depend on Queue retention (24 hours on the
current free plan). Five transport retries lead to the dedicated dead-letter
queue; the durable database event remains recoverable.

The consumer strictly rejects additional fields, acknowledges duplicate/deleted
events, retries only failed valid messages, and persists an idempotent transport
receipt before acknowledging Cloudflare. HTTP always returns 404 and public
Worker/preview routes are disabled. Its only private configuration is the
restricted `snapform_jobs` database credential; it has no auth-table or raw-answer
read permission. Logs contain fixed event names and bounded counts.

Seven actual workerd tests cover publication ordering, Queue failure, duplicate
and malformed messages, partial failure, database configuration outage and the
closed HTTP boundary. They pass. The earlier red tests preceded implementation;
the pinned native message-batch fixture also required explicit attempt counts.
183 pure tests, 63 API tests, 35 rollback-only database tests and three auth
integration tests passed. Formatting, strict types, lint, builds and production
audit passed. The new workspace reuses existing packages; its lockfile adds only
workspace links. Job upload is 216.26 KiB gzip; startup was 24 ms. The real Cron trace
reported 1,902 ms wall / 15 ms CPU, and the consumer 1,553 ms wall / 25 ms
CPU, both outcome ok without exceptions. These are build
and deployment measurements, not end-to-end latency SLOs.

The deployed owned browser submission (reference beginning `904513f7`) retained
its receipt after refresh. Its exact scoped database event changed from pending
(attempts 0) to dispatched and completed (attempts 1) through the real Cron and
Queue consumer. No synthetic event state was forced to success. Dashboard
bindings show `snapform-jobs` as both producer and consumer. Normal submission,
boundary zero/negative validation and refresh were checked in the browser;
malformed/duplicate transport and unavailable-database paths were checked through
workerd. No unrelated service was attacked. Evidence: `44-response-queue-bindings.png`.

This receipt confirms event transport only. Actual notification delivery,
provider retry/history, dead-letter operator UI and external alerts remain
separate integration work. Do not label a transport receipt as an email delivery.

Deployment: initial version `a1c8a74f-f042-4afb-82f9-4b03a66a5209`, followed by the
restricted database secret upload (active version
`3286859d-e968-4780-8861-bf59ee7dde37`). No paid plan or extra Neon branch was created.
[Cloudflare Cron propagation](https://developers.cloudflare.com/workers/configuration/cron-triggers/)
can take up to 15 minutes; the actual first synthetic receipt was observed after
propagation.
