# Webhook delivery workflow — 30 October 2026

The inbox now prepares exact synthetic test payloads, queues a reviewed test,
enables acknowledged endpoints for future responses, and shows the latest 20
delivery outcomes. Unknown outcomes require explicit duplicate-risk consent
before retry. History polls only while work is queued or sending. Unsaved URL
changes disable delivery controls and key reveal. Signing keys remain local,
abortable UI state and never enter the query cache. Existing responses are not
backfilled. No package was added.

Normal-user browser checks used the shared database's owned delivery QA form:
a test was acknowledged with HTTP 204; enabling then submitting email, zero and
acknowledgment answers created one saved response and durable delivery. Scheduled
Jobs recovery delivered it with HTTP 204. Receiver signature verification and
SHA-256 matched the preview's 830 bytes and the response's persisted 861 bytes.
The test did not create a response or consume its allowance.

Power-user checks included double-click preview/send, keyboard operation,
refresh, a second tab, 401 repair/retry, and a controlled 12-second receiver.
A transient uncertain preview request recovered the same preview UUID; it did
not create another. The 401 stopped after one attempt. Repair/retry preserved
its ID and exact payload hash. Timeout became Unknown with retry disabled;
checking the duplicate-risk box allowed an explicit retry, acknowledged on
attempt two. Controlled 429/503 replies remained queued with bounded delays and
visible next-attempt times, rather than claiming success.

Adversarial checks used only owned local boundaries: acknowledged replay and an
expired preview returned 409; unknown payload/query keys 422; a foreign workspace
404; cross-origin mutation 403; oversized JSON 413; wrong method 405. No response
exposed a signing key. The mobile browser rejected a loopback URL before save,
then restored the existing endpoint without replacing its key. Role and forged
membership boundaries are additionally covered by rollback-only real-role tests.

The actual Jobs login skipped an owned row locked by another connection in
105ms, claimed it after release, then rolled that claim back. Its persisted
state remained pending with zero attempts. No test database or branch was used.

At 375px and desktop widths, checks found one main landmark, labeled inputs,
no horizontal overflow and no console warnings/errors. Keyboard focus moved to
status notices. Screenshots were inspected: [mobile](../evidence/59-webhook-delivery-mobile.png)
and [unknown-outcome safeguard](../evidence/60-webhook-unknown-retry.png).
These are basic automated semantic checks plus manual keyboard/visual QA, not
screen-reader, real-device or complete WCAG certification.

All 230 pure tests pass: lines 99.83%, functions 100%, statements 99.55%,
branches 98.10%. Strict types, lint, formatting, production builds and bundle
gates pass. Total client JS is 204.34 KiB gzip; inbox 162.78 KiB; CSS 8.09 KiB;
font 36.07 KiB. Local network-related request uncertainty was observed; idempotent
recovery worked, but production latency targets remain unmeasured. Monitoring,
privacy/retention, backup/restore and deployed release checks remain separate
release gates.
