# Webhook delivery ledger schema — 30 October 2026

Migration 0025 adds one RLS-protected delivery table with immutable configuration,
form-version and response-outbox identities; optional stored exact payload;
bounded attempts/HTTP status; lease and acknowledgement facts; due/expired-lease
indexes. Prepared test events remain distinct from real submitted responses.
Application authority permits only scoped previews for the current published
form/current endpoint. It cannot write outcomes or delete rows; Jobs has no
direct table-read grant. Acknowledgement requires a stored body and an attempt.

The restricted-role test failed before the relation existed, then passed after
migration: default-deny reads, unscoped preview rejection, no direct application
update/delete and no direct Jobs read. Full DB suite passes 46 tests using the
single shared database. No fixture database/branch/reset was created. Generated
SQL review caught a parameter placeholder in a CHECK; the unapplied artifacts
were regenerated with a trusted numeric literal before application. Semantic
snapshot comparison adds only this table and preserves every existing table.
The applied migration will not be rewritten. Types/lint, build and bundle gates
pass; client JS remains 201.98 KiB, API/Jobs 732.96/219.83 KiB gzip. This table alone
neither seeds jobs nor sends requests; those behavioral slices follow.

Separately, merged settings main e012b39 was deployed from a clean checkout:
API f8fafdee-45db-47fe-9768-67b961c5bc60 (99 ms startup, 732.93 KiB gzip), Web
35da34d4-f3d8-4301-bd5f-499306f08854 (29 ms, 365.63 KiB). The shared encryption
key was uploaded only to API secrets. Jobs remains af849dea-e509-44c4-8e6a-838a651f6d9f;
its outbound sender/encryption key have not been activated. API rollback is the
previous d6747c90-cd00-4159-be75-f8bfa7d7d74d code with the additional unused
secret; Web rollback d3a234a0-d03a-47c7-a684-a18554a70af9.

The production browser read the same synthetic saved configuration, showed Off,
revealed a correctly shaped key only on explicit action, and removed it on Hide.
Checks printed booleans rather than key values. At actual 1280 px there was no
overflow or console warning/error. [Production evidence](../evidence/57-production-webhook-settings.png)
contains no key/answers. No outbound request or new submission was made. This
smoke test supplements the normal/power/adversarial settings evidence in 0072;
it does not complete preflight, delivery recovery or the six-workstream release.
