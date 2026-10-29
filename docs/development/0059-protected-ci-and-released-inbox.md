# Protected Git and released inbox/export — 29 October 2026

GitHub main protection is saved, confirmed by the creation toast and main rule.
It requires a PR, the GitHub Actions checks result with an up-to-date branch,
conversation resolution and linear history. Administrator bypass is disabled;
force pushes and deletion are blocked. Required peer approvals are off for the
solo founder workflow. Screenshot 48 records creation without verification codes.
Only the specifically authorized GitHub verification conversation was read in
Gmail, and the agent-created mail tab was closed.

PR #3 inbox and PR #4 native CSV export merged through passing required checks.
Production browser evidence covers normal reads/downloads, keyboard/version
switching, refresh/repeated actions, rate recovery and unrelated identities.
Actual 320/375px checks passed after correcting hidden version badges. Detailed
answer screenshots and CSVs remain outside Git. Export slice 0054 records the
analytics injection fix and current verified web/API releases.

The internal notification foundation PR #5 twice hit a 30-second timeout in the
combined response-reader/export integration case; the other 37 database tests
passed. The focused combined case passed locally in 22.22 seconds total. That
case now has three independently meaningful scenarios: pinned reads/cursors,
tenant/viewer/capability isolation, and published-version CSV permissions. All
twenty original assertions remain, along with the existing 30-second per-case
limit. Each scenario has its own shared-database transaction that always rolls
back. No threshold, skip or assertion was weakened. The three focused scenarios
pass locally in 29.64 seconds total; hosted verification follows. No application
behavior or dependency changes in this test split. These fixture timings do not
measure application latency SLOs.
