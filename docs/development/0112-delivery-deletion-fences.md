# Delivery deletion fences

1 November 2026. Migration 0037 checks pending deletion and durable purge intents
before webhook preparation, completion or explicit retry, and before owner email
repair. Webhook preparation cancels stale work for a pending target. Cancelling
the deletion does not automatically requeue it; a new explicit repair remains
possible while the original retry limits permit it.

Webhook preparation and outcome recording now lock workspace before delivery,
matching deletion/settings lock order. Lease expiry is checked after the row lock
and against the current clock. Payload identity, immutable bytes, endpoint
verification, Unknown duplicate-risk acknowledgement, attempt limits and preview
expiry retain their canonical checks. `CREATE OR REPLACE` preserves the existing
narrow grants; no new runtime privilege or dependency is introduced.

Existing bounded claims remain in place. They do not acquire workspace locks
after holding delivery rows or send provider HTTP themselves. The authorization
gate immediately before provider work serializes with deletion. Rewriting every
claim is unnecessary for this safeguard. Database locks are released before HTTP;
an already in-flight request cannot be recalled by a later deletion.

## Verification

- Rollback tests first reproduced webhook preparation accepting a pending target
  and manual owner-email repair incorrectly queuing a pending response.
- Both candidate and applied migration pass the operator-only email and webhook
  probes. They cover lease fencing, immutable bytes, verified test requests,
  explicit Unknown repair, preview/attempt bounds, response deletion, cancellation
  and durable purge intents. All synthetic writes roll back; these probes make
  no provider HTTP requests. The webhook probe separately uses actual restricted
  Jobs credentials to verify its execution grants and lack of queue authority.
- Two concurrent candidate-DDL probes initially contended on `pg_proc`; they were
  rerun serially without raising the five-second lock timeout. A later interrupted
  run lost its connection and was rerun rather than recorded as a pass.
- Read-only review found no SQL, authorization or protocol blocker. The migration
  journal and SQL-only snapshot are registered without a table-schema change.
- All 84 API and 37 Jobs tests, five affected database integrations, formatting,
  types, lint, production build, bundle budgets and dependency audit pass. Real
  Worker preview and two API reloads/three auth cleanup cycles pass. The preview
  first refused the occupied QA port; the owned dev server was stopped before
  rerunning it. No unrelated server was stopped.

## Browser evidence

The local real Workers and shared Neon sent synthetic preview
`7213e170-a367-44f8-b6c7-3b8ab62da4c1` only to the existing owned QA receiver.
The normal preview/review/send journey showed HTTP 204 acknowledged. A double
click still produced one attempt, and reload/refresh retained the acknowledgement.
At 390 × 844 there was no horizontal overflow; native Tab reached the labelled
endpoint input. A guessed foreign workspace showed no response list or details.
The console was clear. No key was revealed or replaced, and no email was sent.
The private mobile screenshot is `.recovery/webhook-fence-mobile.jpg`. The viewport
was restored and the two QA tabs closed afterward. Pending deletion itself is
covered by the rollback probes here; its browser controls are not exposed yet.

Operator probes remain a separate release check; CI does not receive the
migration-owner credential. Owner deletion UI, active purge/replay and the final
release checks are still separate unfinished work.
