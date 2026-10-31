# Workspace deletion write boundary — 31 October 2026

Private mutations now take the workspace lock before checking pending deletion.
The database resolves actual membership and resets transaction-local intake/public
context in one scoped call. It rechecks membership after waiting for the lock.
The API returns WORKSPACE_DELETION_PENDING as HTTP 409 for form, publication,
notification and webhook writes. Response reads/exports and owner/editor
integration inspection remain available; viewers cannot inspect integrations.

The rollback-only restricted-runtime regression covers forged role context,
nonmembers, null write mode, viewer denial, pending writes, cancellation recovery,
integration reads and context cleanup. All 57 database tests and three auth
integration tests passed. Four real Express/Worker boundary cases first returned
500, then passed with explicit 409 responses. The full 84-test API suite passed.
Pure contracts: 238 tests, 99.84% lines and 97.74% branches. Jobs: 36 tests.
Formatting, strict types, lint and the API dry-run build passed. No dependency was
added. Latest web measurements remain home 119.34, collector 160.19, editor
182.44 and inbox 162.78 KiB gzip, with CSS 8.09 KiB and primary font 36.07 KiB.

In the local in-app browser, the existing synthetic QA workspace/editor loaded;
a title edit saved and survived reload, then the original title was restored and
saved. The response inbox and integration reads loaded. A guessed unrelated
workspace returned WORKSPACE_NOT_FOUND without data. No console warnings/errors
were observed on the editor/inbox journey. These are desktop regression checks;
the pending-deletion UI journey awaits its API/UI slice. Worker/SQL tests cover
the pending state now. Migration 0033 was applied to the shared database; no
production API/Jobs deployment occurred in this slice.

The genuine public QA collector also completed in an Incognito window with an
automatically passed Turnstile check. The user performed the final submission
because native scrolling was unavailable. Read-only verification found the saved
zero, consent and synthetic email, one outbox event, no email delivery, and one
webhook acknowledged with HTTP 204 on its first attempt. Native reload/back
attempts before submission were inconclusive and are not claimed as passed.

Hosted manual backup run 41176830809 succeeded on main 3b1200266f04ca05bc76673f75ad6ab2d6741c96,
including export, encrypted R2 roundtrip and isolated PostgreSQL restore. Purge
replay, independent key custody, freshness alerting and nightly scheduling remain
open; this does not establish production recovery or latency SLOs.
