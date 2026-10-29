# Future-only owner notifications — 29 October 2026

Email notifications default to off. A saved form setting uses a revision check
and the existing writable draft lock to serialize concurrent first-time changes.
Enabling affects future submissions only. The response outbox transaction seeds
one delivery record with its verified workspace owner's identity, email and
settings revision. Disabling cancels unsent work; re-enabling never replays it.
No respondent answers enter the delivery ledger.

The restricted runtime can read the ledger but cannot insert or update delivery
outcomes. Composite foreign keys bind each delivery to the exact tenant, form,
response and outbox event. Fixed-search-path trigger functions have no PUBLIC
execute privilege. The jobs identity still cannot read authentication tables.
These tables do not send email: provider handling, claims, retries, visible status
and the settings interface are the next slice.

Behavioral tests failed before implementation and now prove default-off behavior,
no backfill, verified-owner snapshots, idempotent settings, stale revisions,
opt-out cancellation, tenant/role enforcement and table privileges. All 37 shared
database tests passed with rollback-only synthetic fixtures. Three pure contract
tests passed, including the invalid enabled/revision-zero regression. Strict
checks passed. This internal database slice adds no browser entry point and does
not change the previously checked inbox/export journeys or client assets.

Migration 0018 was applied to the one shared Neon database. Review then found that
SQL CHECK expressions using equality can accept NULL via unknown truth values.
A rollback-only operator probe reproduced that failure. Additive migration 0019
uses IS NOT DISTINCT FROM; the same probe now rejects NULL cancellation/failure
reasons and unknown states with SQLSTATE 23514. Existing migration history was
preserved. Both use a five-second lock timeout. Generated snapshots were reviewed
separately: only the two new tables, outbox composite key and delivery state check
changed. No database branch, reset or external email was used.

No dependency was added. The next provider slice must distinguish accepted email
from actual delivery, bound retries to Resend's documented 24-hour idempotency
window and expose uncertainty for repair. Disabling cannot retract a provider
request already sent; the interface must state that limitation.
