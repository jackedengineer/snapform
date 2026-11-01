# Bounded deletion metadata expiry

1 November 2026. Migration 0039 adds a Jobs-only function which removes at most
100 requests and 100 intents per invocation. Cancelled requests become eligible
90 days after cancellation; completed requests/intents become eligible 90 days
after completion. Pending requests and intents have no age-based expiry.

Completed metadata is kept if its target still exists. Referenced intents are
kept until their request receipts have been removed. The function takes row
locks with SKIP LOCKED, checks its fixed maximum, uses a fixed search path and
grants no direct table deletion to Jobs or application users. There is no public
API. SQL identity guards and completed receipts last through this retention
window; they are not an indefinite UUID reservation service.

Jobs invokes cleanup only when PURGE_ENABLED is explicitly 1 and the preceding
purge batches reported no failure. Cleanup errors fail the scheduled event and
the connection still closes. Operational logs contain bounded counts only.
Purge remains disabled, so this change does not enable either content deletion
or metadata cleanup in production.

## Verification

- The actual isolated PostgreSQL restore first failed with the missing-function
  signal. With the migration it passed all 40 migrations, old-record cleanup,
  one-row batch bounds, pending/recent preservation, live-target preservation and
  restricted-role checks. Fixture writes roll back; the isolated container and
  plaintext restore are removed. No separate shared test database was created.
- Independent review identified a test assumption about older archived records.
  The drill now drains bounded batches based on an initial aggregate count,
  capped at 10,000 iterations, instead of assuming the synthetic rows are first.
  Two older fixtures exercise that case. No production safety rule changed.
- Actual workerd scheduled-event tests went from two failures to 43 Jobs tests
  passing. They cover invocation, disabled activation, propagation of cleanup
  errors and connection cleanup. The PostgreSQL drill covers the SQL behavior;
  mocked database commands are not presented as a live purge.
- Fast checks, recovery tests, build/bundle and SSR/service-binding preview
  passed. Generated snapshot 0039 differs from 0038 only in its two migration
  identity fields; its schema was reviewed separately. No dependency was added.
- After applying the additive shared migration, 63 restricted-Neon database
  tests and three auth integration tests passed. Synthetic writes roll back.

The shared migration is additive. No permanent browser deletion was performed
for this slice.
The owned nonempty ledger/purge drill, actual alerts, backup scheduling and
final deployed browser journeys remain separate release gates.
