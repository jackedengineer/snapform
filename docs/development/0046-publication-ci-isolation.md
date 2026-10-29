# Publication CI isolation — 29 October 2026

The first hosted run failed because the required CI secrets were absent. After
the user approved and configured the restricted runtime URL and a separate
CI-only auth signing secret, the run passed installation, build, types, lint,
unit and all 62 Worker tests. Two publication database cases then exceeded
their existing 30-second limit from the hosted runner to the shared Neon region.

Those two long scenarios are split into eight focused rollback-only cases:
immutable snapshot/idempotency, successive version numbering, old retry versus
new publication, repeated stop, reactivation/stale stop/changed operation,
invalid/stale drafts, missing/viewer denial and actor/form identity binding.
Their behavioral assertions remain covered; no timeout or quality threshold was
increased. All eight pass locally. Hosted verification of the new revision is
still required. This is not evidence of a production latency SLO.

A clean configuration check without the local `.dev.vars` also reproduced a
503-versus-200 mismatch when tests inherited the newly configured production
Turnstile key. The Worker test configuration now explicitly supplies empty
challenge keys, so the existing fail-closed boundary assertion is deterministic.
It fails before the fix and both configuration tests pass afterward. Automated
tests still cannot send live email or validate challenges against production.

CI uses the one existing database with synthetic transactions that roll back;
neither migration-owner access nor production signing credentials were granted.
