# Finalized response read boundary — 29 October 2026

Authenticated workspace members can list finalized responses and read a selected
response against its immutable published definition. Unfinished answers remain
outside this inbox. Lists project only identity, publication version and exact
submission timestamp; details explicitly project answers and definition, never a
capability hash. Queries repeat verified membership/capability checks and RLS
requires actual membership, not a forged role setting.

Migration 0017 adds only the finalized-response membership policy and a partial
workspace/form/submission/identity index. Other tables, columns and foreign keys
are unchanged in the generated snapshot. A five-second lock timeout bounds the
additive migration. It has been applied to the one shared Neon database; no
branch/database was created and no records were reset.

The new real-database behavioral test first returned no rows under the previous
policy. It now proves stable timestamp/UUID ordering, microsecond cursor
precision, pinned questions despite later draft edits, hidden partial responses,
owner/viewer reads, unknown response/form IDs and forged-actor rejection. Its
synthetic users, forms, responses and usage all roll back. A real workerd test
first returned 404 before routing existed; it now requires authentication on
list/detail and malformed query requests.

A native HTTP probe through the actual local web-to-Express Worker binding
signed in with the owned QA account, read its exact synthetic submission and
rejected malformed cursors, unknown query keys, unrelated identities, unsupported
methods and anonymous reads. Only bounded outcomes were logged; its temporary
auth session was signed out. Browser review opened historical versions 1 and 5,
retained selection through full refresh, used keyboard selection and repeated
refresh, and rejected an unrelated response UUID without showing old answers.
The stored HTML-like QA answer remained literal text, with zero inserted images
and no browser warnings/errors. UI evidence is recorded with the following UI
slice; mobile viewport verification is still pending because the browser
viewport capability did not change the measured page width.

The current combined working-tree checks passed: 187 pure tests (100% lines and
functions, 99.54% statements, 98.60% branches), 64 API Worker tests, 36 real
rollback-only database tests, strict types/lint/format, SSR/service-binding and
dev reload checks. The inbox UI, CSV export and production deployment are
separate increments; this API does not claim export or notification delivery.
