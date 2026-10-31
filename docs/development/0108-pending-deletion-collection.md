# Pending deletion and public collection — 31 October 2026

Migration 0034 hides public definitions for a workspace pending deletion and
blocks session reads, admission and mutations for pending workspace/response
targets. Cancellation restores collection. Start and mutation acquire the
workspace lock before quota/publication/response locks and recheck access after
waiting. Existing submitted receipts remain recoverable after ordinary
unpublishing; fresh admission still requires an active publication.

The restricted rollback regression first reproduced a pending response remaining
readable. The isolated restored-copy probe passed after the change, including
pending admission/mutation denial, cancellation and submitted receipt recovery.
Review caught the initial active-publication filter breaking that receipt retry;
the filter was corrected and a regression retained. All 13 affected real database
tests and nine public/intake Worker tests passed in the focused validation.
The additive migration was then applied to the shared database.

The real local collector saved zero and consent, recovered them after reload,
preserved them through back/review, rejected missing/out-of-range input and
produced one receipt despite a double click. Read-only verification found one
submit operation, one outbox event and no email. No console warnings/errors were
observed. These are regression journeys; the deletion UI remains unexposed until
its later slice. The current local full database runs also show intermittent
remote query/connection delays; full hosted CI is required before merge. Neither
these focused results nor bundle measurements establish production latency SLOs.

No provider, application dependency, timeout or assertion threshold changed.
The generated migration snapshot preserves the prior schema apart from its IDs.
Delivery guards, active Jobs, ledger replay and owner controls remain separate
activation gates.
