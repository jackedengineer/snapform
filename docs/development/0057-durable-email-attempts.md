# Durable owner email attempts — 29 October 2026

The jobs identity receives at most five due email claims, each with a fresh
two-minute lease. A claim checks current opt-in, verified owner identity/email,
eight-attempt limit and the 23-hour retry window. Outcomes require the current
unexpired token. Retry backoff is durable; accepted work is never reclaimed.
Application runtime and direct jobs table writes remain forbidden. Provider IDs
are unique. A stable non-sensitive delivery tag will correlate signed provider
receipts even if a provider acceptance reply is lost.

The restricted-runtime test failed before the functions existed, then passed
their authorization boundary. The local operator command
`pnpm --filter @snapform/database verify:email-delivery` checks real job-login
execution against a nonexistent identity, then exercises claims/results inside
an operator transaction containing only newly created synthetic fixtures. Every
write rolls back. It proves duplicate exclusion, forged/stale token rejection,
backoff, crashed-lease recovery, stable identity/time, accepted-work exclusion,
expiry, attempt bounds, recipient eligibility and opt-out cancellation.

The operator cannot SET ROLE to the job identity; no membership grant was added
to make the test work. State transitions run under the operator, with restricted
login/ACL checks separately. The local migration credential is never placed in
CI. The operator command uses Node's native experimental type transformation for
existing parameter properties in application sources; production Workers do not
use that flag or gain a dependency.

The NULL retry-delay probe failed against applied migration 0020. Additive
migration 0021 makes argument validation explicitly false for SQL unknown values;
the same probe now returns false without changing the active claim. Migration
0019/0020 snapshots differ only in delivery fields/constraints; 0021 has no schema
drift. No applied migration was rewritten. One migration connection ended before
completion; an idempotent retry succeeded and the verification was repeated.

This internal slice does not yet run provider sends from Cron or expose settings.
Those boundaries and their browser checks follow before notification release.
An opt-out cannot retract a request already in flight. Accepted means accepted
by the provider, not delivered to a recipient's mail server or read by a person.
