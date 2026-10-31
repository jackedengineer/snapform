# Repeatable isolated restore drill

The native Node operator runner verifies the signed descriptor, exact ciphertext
size/hash and AES-GCM authentication before starting PostgreSQL. It accepts only
the pinned image and a local Unix Docker engine. Its disposable container has no
network or published ports, a read-only root filesystem and temporary memory-backed
PostgreSQL data. Authenticated dump bytes enter pg_restore through stdin; no host
folder or socket is mounted into the container.

Restore preserves archived ACLs. The actual snapform_owner and inert provider roles are
recreated, with temporary cloud_admin/neondb_owner membership removed after restoration.
Runtime and Jobs retain their restricted attributes. Aggregate checks verify the
migration journal, unscoped response isolation and critical privilege boundaries.
No raw answers or provider diagnostics enter command output.

A real downloaded R2 copy restored 31 migrations in 6,868 ms. The initial real run
failed during bootstrap; readiness now waits for the final postgres PID 1 rather
than the entrypoint's temporary initialization server. The next restore exposed
the existing public schema conflicting with the archived CREATE SCHEMA. The
empty default schema is removed before restoring its archived owner/ACLs. A fresh snapshot exposed a second owner assumption: new default ACLs require
the actual snapform_owner identity as well as inert provider roles. That snapshot
then restored all 32 migrations in 6,233 ms. No ACLs
are stripped and no broad runtime grants are added to make the drill pass.

Seven offline process tests cover unauthenticated input, foreign Docker engines,
isolation flags, restore/isolation failures and termination cleanup. Review caught
SIGTERM bypassing finally; the regression failed before signal handling and passes
afterward. SIGINT/SIGTERM now abort active commands and await container/plaintext
cleanup. SIGKILL, power loss and engine failure cannot guarantee cleanup; the
operator must inspect/remove any snapform-restore-* container and private
.restore-* folder after an interrupted host.

The manual backup workflow also runs the drill after the exact downloaded R2
bytes match the signed local pair. Its success output includes the restored
migration count and timing. Existing recovery tests keep their five-second limits;
the new process/termination tests have a separate 15-second limit. No app/runtime
package or browser bundle dependency is added. A full fresh export/R2 roundtrip
then passed with 215,861 encrypted bytes, 24 table-data entries and 32 restored
migrations; isolated restore took 4,108 ms. The runner's trusted operator-only
inspection callback permits concurrent SQL checks inside the temporary restored
copy before its mandatory cleanup; it cannot select a remote database.


This verifies snapshot restoration only. Pending SQL intents, newer R2 purge
ledger entries, migrations after the selected snapshot, independent key custody,
freshness alert delivery and automatic scheduling remain required before calling
recovery complete or reopening restored traffic. The runner deliberately reports
purgeReplay: not-exercised. It is not a production recovery-time SLO.

Source checks: [PostgreSQL pg_restore](https://www.postgresql.org/docs/current/app-pgrestore.html)
defines stdin, owner, ACL, transaction and exit-on-error behavior;
[Docker none networking](https://docs.docker.com/engine/network/drivers/none/) describes
the isolated network mode. Actual drills and container inspection provide runtime
evidence in addition to those documented capabilities.
