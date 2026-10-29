# Explicit send and safe retry — 30 October 2026

Migration 0028 adds one narrowly granted queue transition. It requires real
owner/editor membership, current tenant/configuration/revision and exact attempt
count. Fresh previews expire after 15 minutes and require their current active
publication. Real-response retries require delivery still enabled and verified.
Pending/sending/cancelled/acknowledged work cannot be queued again. Unknown
requires explicit duplicate-risk acknowledgment; only repairable failures can
retry, with unchanged identity/payload and no reset of the eight-attempt ceiling.
Jobs cannot execute this authorizing user operation; runtime retains no direct
delivery UPDATE permission. Endpoint edits never retarget old work.

The real runtime-login test first failed at the missing SQL function, then passed
preview send, duplicate/stale/null/foreign tuple rejection and a forged owner
role backed by actual viewer membership. The owner rollback rehearsal additionally
passes Unknown acknowledgment, same-byte repair, invalid-payload/attempt limits,
expired previews, acknowledged replay and configuration fences. Its actual Jobs
login check confirms queue EXECUTE denied. All synthetic writes roll back; no
HTTP requests occur. The generated 0028 snapshot is structurally identical to
0027 apart from migration identity; the applied migration adds no table changes.
API/UI exposure and live receiver/browser evidence remain subsequent gates.

All 50 restricted-role database tests pass. Database types and lint pass after
making the nullable rejection test's tuple positions explicit; no assertion was
removed. The SQL-only runtime addition leaves the preceding built artifacts valid.
