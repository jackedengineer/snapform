# Bounded email repair — 29 October 2026

Owners/editors can queue an eligible failed notification from delivery history.
The database computes eligibility and checks it again under locks. The operation
preserves the original recipient, delivery identity, attempt count and first
attempt time; the sender keeps its existing idempotency key. It never restarts
the 23-hour window or eight-attempt limit. Accepted, delivered, cancelled,
suppressed, exhausted and expired work cannot be replayed. Current opt-in and a
verified, unchanged workspace owner are required. A stale/duplicate request is a
409; it does not queue another message. Role context cannot replace membership.

The first operator test failed loading the missing repair export, then failed on
the absent SQL function. The implementation passes accepted-work exclusion,
stale counts, wrong form/actor, expired window, changed verification, duplicate
repair, stable identity/payload/window and subsequent acceptance checks. Additional
forged-role viewer probes check the SQL boundary directly. Every operator fixture
write rolls back. Migration 0023 adds only the two functions and scoped grants;
its generated table snapshot matches 0022. No applied migration was rewritten.

The client request test failed before the request existed and now passes strict
ID/count/recipient rejection. All 208 pure tests pass, with coverage unchanged at
100% lines/functions, 99.61% statements and 98.17% branches. All 67 API Worker,
41 database and three auth integration tests pass. Actual authenticated HTTP
probes rejected cancelled replay (409), recipient/count/query overrides (422),
foreign origin (403) and unrelated workspace (404); their temporary auth session
was signed out. The real three-Worker preview smoke checks pass.

Normal browser journey: opt in on the owned QA form, enter zero budget and reviewed
synthetic answers, submit, and see one new delivery. Read-only checks first proved
there was no other pending mail or outbox work. Manually invoking the real local
scheduled Worker without a sender recorded configuration attention with one
attempt; no email was sent. This is an intentional application QA record created
through the browser, separate from rollback-only automated SQL fixtures.

Power journey at 320px: refresh recovers the configuration failure; three rapid
Enter presses queue the original delivery once, show Retry queued, remove the
ineligible action and return focus to Refresh delivery status. Independent reads
confirm pending/one attempt, two total ledger records including the earlier
cancelled notification, and no replay. The local scheduler was stopped afterward.
At actual 1280px, history is readable without response answers (screenshot 52).
Both widths have no horizontal overflow. The cancelled record has no retry action.

One local refresh temporarily displayed the generic request error; the preview
reported a cancelled/hung Worker request. A restricted database read was healthy,
and the visible refresh recovered. Its underlying runtime cause is not claimed
resolved; production reconciliation/monitoring remains a gate. The collector's
misleading pending-submit saved-state copy was reproduced and remains a separate
polish fix. No hardware-device or screen-reader claim is made.

The first retry artifact was 200.07 KiB gzip JS. A trial form-library chunk merge
increased size and was reverted; concise copy and the original lazy boundaries
produce 199.96 KiB JS, 7.85 KiB CSS and 36.07 KiB font. No threshold/dependency
changed. This is artifact evidence, not production latency. Live delivery of the
queued owned record and its authenticated provider receipt remain deployment gates.

Local scheduled invocation follows the [Cloudflare Cron test documentation](https://developers.cloudflare.com/workers/runtime-apis/handlers/scheduled/).
