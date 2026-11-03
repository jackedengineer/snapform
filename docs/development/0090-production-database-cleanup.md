# Production database cleanup release

Clean main `35af76b314039da0caf7ff619f250c5a0f1d75d1` was deployed after
PR24 passed every hosted verification gate. API version:
`6ac69465-f06f-4a4f-9454-390869d17ca0`. Jobs version:
`f74ed723-08bd-495a-b093-951bd6d08114`. Web remains
`a6e40b7e-5754-4c92-9be0-b2192122becd`.

The release avoids waiting for an already-fired socket-close event after early
PostgreSQL authentication failure. Cleanup is idempotent and does not attempt a
late termination write after that close. Node keeps its validated default write
batching; the earlier Worker-only batching fix is retained. This also deploys the
sanitized request timing already merged in PR20.

Native HTTP smoke checks passed for health, owned QA sign-in, /me, inbox,
concurrent repeated reads, typed zero/true detail and pinned-version CSV. Forged
workspace and unknown-query requests returned 404/422; anonymous access returned 401,
cross-origin mutation 403, and unsigned Resend callback 401. Sign-out succeeded and
the temporary session was revoked. Credentials, cookies and answer bodies were
not logged. Actual browser evidence is recorded separately in 0091 and 0093.

API gzip upload is 737.64 KiB, compared with 737.55 KiB previously. These are Worker
artifact measurements, not mobile load-time or submission SLO measurements. Some
local full database runs still encountered connection timeouts; focused follow-up
and all hosted release gates passed. Read-only provider checks found no database
lock wait, and an independent Git push also encountered a transient DNS failure.
That supports investigating connectivity; it does not prove every timeout has an
external cause. Production error timing must continue to be monitored.

The release does not activate purge scheduling or install backup-bucket access
in an application Worker. Rollback versions: API
`bfa635a5-cd74-4a05-9572-e5cac18ecc63`, Jobs
`4862840c-2b08-4715-815e-72e0d6d5aa75`.
