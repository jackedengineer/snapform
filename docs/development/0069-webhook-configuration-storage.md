# Webhook configuration storage — 30 October 2026

Migration 0024 adds two RLS-protected tables: immutable encrypted endpoint/key
configurations and the form's current disabled-by-default configuration pointer.
Composite tenant/form foreign keys prevent cross-form attachment. The application
role can insert configurations but cannot update/delete them or forge verified_at;
only a later Jobs preflight receipt may establish verification. A database trigger
blocks enablement without that verification, including direct application SQL.

The failing rollback-only test was recorded before the tables existed. Expected
and observed after migration: defaults off/revision 1; unverified enable 23514;
configuration mutation and forged verification 42501; another form's pointer
23503. Jobs has no direct SELECT grant. All synthetic fixture writes roll back.
The full restricted-login suite passes 45 tests. No test database/branch exists.
Generated SQL/snapshot were inspected separately: two new tables, policies,
foreign keys and explicit grants; no old table/data rewrite. The first migration
attempt hit the five-second lock timeout while CI tests held transactions; the
entire migration rolled back. It applied after those transactions drained, with
the timeout unchanged. Never terminate unrelated sessions to force a migration.

This storage slice exposes no HTTP/browser feature. Normal/power/adversarial
browser verification remains required with the settings controls. Production
entries do not import this module yet; build/bundle checks retain 199.97 KiB total
client JS and 729.81/219.83 KiB API/Jobs gzip. Existing production collector recovery
was smoke-checked separately after deploying merged main: Web version
`d3a234a0-d03a-47c7-a684-a18554a70af9`, startup 27 ms, gzip 363.08 KiB.
At 375 px its original QA receipt recovered after refresh with heading focus,
no overflow or console errors; a second tab correctly refused duplicate access.
