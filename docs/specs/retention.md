# Workspace retention and deletion

This implements FR-41/42 within the existing six-step showcase scope. Platform,
single-database, role, rollback-test and quality constraints stay unchanged.

## Capabilities and order

1. `retention-settings`: members can inspect the policy; only an actual owner
   can select 30/90/365 elapsed days, default 90. Saving requires explicit purge
   acknowledgment and the current revision. Concurrent/stale changes cannot win.
2. `expiry-purge`: a bounded Jobs operation removes expired collecting sessions
   (seven-day lifetime) and submitted records older than workspace retention.
   Response operations, outbox, email/webhook payloads and derived delivery rows
   cascade with the response. Usage accounting is not reset by deletion.
3. `owner-deletion`: owner schedules response/workspace deletion with a 24-hour
   cancellation window and a seven-day purge deadline. Stop new collection/delivery while appropriate deletion
   is pending. Existing in-flight external requests cannot be retracted. Cancel
   does not replay cancelled delivery actions. No immediate irreversible UI purge.
4. `recovery`: content-free tombstones/audit survive deleted targets for 90 days.
   Restore re-applies tombstones before traffic is reopened; expired backup
   copies have a separately documented lifetime. Backups require a demonstrated
   isolated restore, not merely a successful upload.

## First slice: retention settings

Source: shared strict contracts, workspace-scoped database schema/helpers and
real restricted-role tests. Existing records without a policy read as 90 days,
revision zero. A row starts at revision one. Runtime cannot delete policy rows;
owner membership and transaction-local workspace scope are both checked by RLS.
The API repeats role/validation checks. No migration ownership enters runtime.

The initial slice exposes no UI claim that automatic purge already works. Ship
controls only after the corresponding Jobs operation and failure behavior pass.
No files/export objects exist in the current release: file collection remains
blocked and CSV exports stream without retained object copies.

## Verification and implementation boundaries

Use `pnpm test:unit --coverage`, focused `pnpm --filter @snapform/database test
 test/retention.test.ts`, `pnpm test:api`, `pnpm test:jobs`, `pnpm check:fast`,
`pnpm build` and `pnpm check:bundle` as each boundary is implemented. Write a
failing behavior test first. Match existing pure contracts, direct Drizzle
transactions and parameterized SQL; no generic deletion framework or new SDK.
Review generated SQL/snapshot separately. Automated synthetic writes/deletes
always roll back against the one database. Browser checks cover normal owner
configuration, keyboard/stale/multi-tab use, and forged role/tenant/input requests.

No public compliance certification or legal identity is inferred. Public
support/privacy/abuse contact is trainwithchirag@gmail.com, labeled Snapform.
R2 currently requires the user's approved payment-method setup. The user subsequently approved one scoped exception: an isolated temporary local
restore with no network or exposed ports, removed after verification. That drill
passed; it does not authorize another Neon database/branch or persistent local
test database. Remote expiry, purge replay and automated backups remain open.

## Purge/recovery ordering

After expiry or the cancellation deadline, Jobs commits a bounded irreversible
purge intent. Owners cannot cancel an intent already claimed for purge, and
longer retention does not revive records already claimed after expiry. Before
removing content, Jobs must persist that intent in the private encrypted R2
recovery ledger. A failed ledger write prevents content deletion and raises an
operational failure. Finalization is scoped/idempotent and cascades dependent
response data. Restore reapplies every durable intent before serving traffic,
even if a crash happened between its ledger write and final SQL deletion.
Tombstones prevent target-ID reuse while retained; metadata lasts 90 days and
backup copies must expire earlier. No raw answers enter recovery-ledger objects.
This ordering avoids recording cancelled requests as irreversible tombstones.

Recovery must also drain pending SQL intents restored from the snapshot, not
only objects still present in R2. A long-stalled intent may outlive its first R2
copy while remaining in every valid newer database snapshot. Re-archive that
authenticated SQL intent before finalizing it and opening traffic. Reject
expired or unauthenticated backup manifests; storage upload time cannot reset
the signed snapshot's eligibility window.
