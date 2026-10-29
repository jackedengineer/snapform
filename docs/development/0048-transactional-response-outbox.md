# Transactional response outbox — 29 October 2026

Migration 0015 adds a scoped `response_outbox`. A fixed-search-path trigger
records one `response.submitted` event when a response moves from collecting to
submitted. The event, response, operation receipt and consumed usage share the
existing transaction; there is no Queue network call inside it. A unique
session identity prevents multiple events. Metadata contains no answers,
respondent capability or provider secret.

Runtime access is read-only and guarded by the response capability or real
workspace membership. Direct insertion, dispatch updates and deletion are not
granted. The composite foreign key preserves the exact workspace/form/version/
response relationship. Future response deletion cascades queued metadata; the
deletion workflow and restore tombstones still need implementation.

Verification:

- The affected test failed before migration because the outbox was absent.
  Afterward, partial/invalid progress creates no event; duplicate finalization
  creates one event and consumes one response slot.
- A rollback after finalization restores collecting state, empty answers, zero
  consumed usage and no event. An unscoped read sees no event; runtime dispatch
  write privileges are false. All six affected intake cases pass.
- All 34 database cases, strict checks, production builds and bundle gate pass.
  Generated snapshot review found only `public.response_outbox` added and no
  changes to existing table definitions. The migration is additive, uses a
  five-second lock timeout and was applied to the one existing Neon database.
- Production browser QA: a negative budget blocks review and focuses its
  diagnostic; correcting it to zero permits review/submission. The owned form
  had one collecting session and zero events before submission, then one
  submitted response and one pending event afterward. Receipt refresh retained
  the durable reference. No test usage or shared table was reset.

The response event and dead-letter Queues are created, without a paid upgrade.
Dispatch/consumer leases, retry reconciliation and outbound effects are the
next slice. A pending database event is not a delivered notification. Current
free Queue retention is 24 hours; the database event must remain authoritative
and reconcile queue loss rather than rely on longer transport retention.
[Queue pricing/retention](https://developers.cloudflare.com/queues/platform/pricing/).

Platform PR #1 passed every hosted CI step and was merged with linear history:
[verified run](https://github.com/jackedengineer/snapform/actions/runs/40870957281).
Main-branch protection still awaits GitHub owner reauthentication; it is not
claimed as enabled.
