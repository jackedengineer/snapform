# Response expiry claim and finalization

The additive 0030 migration introduces only `purge_intent`; generated snapshot
comparison leaves existing tables and all other schema categories unchanged.
Metadata has no content-target foreign key, so it survives response cascades.
Forced RLS and revoked direct grants protect it; only Jobs can execute the two
fixed-search-path claim/finalize functions. No API or scheduled purge is enabled.

Claims are bounded to 1–20 rows, reuse pending intents before adding more, and
skip locked response rows. Collecting sessions expire at their existing seven-day
deadline; submitted records use elapsed 24-hour days from submission and the
30/90/365-day policy (default 90). Claiming creates an irreversible intent and
stops outstanding transport/email/webhook work. A later retention extension
cannot revive a claimed target. Finalization is idempotent and removes response
operations, outbox and delivery content through existing cascades. Creator trial
usage is preserved. Inserts/updates cannot reuse a claimed response identity.

Tests first failed on missing behavior/functions. The operator drill passed in
9,030 ms against the one shared database, with every synthetic write/delete
rolled back and absence checked afterward. It verifies expiry boundaries, valid
and invalid limits, stable repeated claims, no deletion at claim time, cancelled
delivery, repeated/unknown finalization, cascades, unchanged usage, reuse denial,
365-day extension and subsequent 30-day shortening. A real Jobs login verifies
its identity and scoped missing-target behavior. The restricted runtime test
passes and cannot claim/finalize or directly read this metadata. No HTTP request
or external delivery occurs in this drill.

This is an internal foundation. Jobs must acknowledge the encrypted private R2
ledger before finalizing. Remote bucket/key/lifecycle setup, scheduled wiring,
90-day metadata cleanup, restore replay and owner deletion/cancellation controls
remain before activation and browser feature verification. The prior browser
inbox regression still applies; no retention UI is advertised as working yet.
