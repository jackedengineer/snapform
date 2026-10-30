# Restricted snapshot identity

The operator bootstrap gives `snapform_backup` SELECT on public and migration
metadata tables/sequences, including future tables created by the migration
owner. BYPASSRLS is required to export complete FORCE-RLS tables; this is a
private full-snapshot reader, never an application identity. It owns no objects,
has no role memberships, table writes, schema/database creation privileges or
application security-definer execution. It cannot create roles/databases or
replicate, does not inherit, and has a two-connection limit. A read-only default
is a secondary precaution; privilege denial is the write boundary.

The existing private archive key is preserved. The bootstrap holds a database
advisory lock before reading configuration, choosing/persisting a credential and
enabling the login. Saving the desired credential before commit allows setup to
retry after a database failure. An existing live password is never silently
rotated. Missing credentials for an existing role require an operator handoff.
Configuration must have private filesystem permissions; provider diagnostics and
password query parameters are never printed. No owner credential goes to CI.

A focused real-database verification rolls back all synthetic DDL, grants and
role changes. It verifies current/future SELECT, absent write/creation/privileged
function grants, role attributes and idempotent provisioning. A savepoint adds
a temporary owned schema and confirms ownership is rejected, then rolls it back.
Read-only review identified and corrected both concurrent first-run password
selection and the earlier relation-only ownership check.

The actual restricted login authenticated with transaction_read_only on, and
exported 201,563 encrypted bytes across 23 table-data entries through pg_dump.
This operator-only change adds no runtime dependency or application bundle bytes.
Automated scheduling, independently recoverable key custody and replay of
post-snapshot deletions are still open release gates.
