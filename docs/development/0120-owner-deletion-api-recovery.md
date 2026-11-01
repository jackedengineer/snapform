# Owner deletion API and receipt recovery

1 November 2026. Owners can schedule a response/workspace deletion with exact
confirmation, explicit acknowledgement and a stable request UUID; recover the
latest target receipt after reload; and cancel using its revision within the
existing 24-hour window. SQL repeats real membership authorization. After a whole
workspace purge, only its initiating owner can recover the minimal completion
receipt without membership; this grants no cancellation or data access.

Migration 0038 was applied with the existing five-second lock limit. Its generated
snapshot matches 0037 apart from IDs. The restricted Neon regression first failed
when target recovery returned null, then passed after implementation; its
automated synthetic writes rolled back. The isolated 39-migration probe first
failed on the removed owner's completion receipt, then passed, denying strangers,
direct table reads, Jobs access and cancellation after purge. Review caught a
malformed-target result bypassing the helper's authorization distinction; the
dedicated invalid-target error now propagates as 422, with failing-then-passing
owner/stranger/editor regressions. No receipt contents were exposed by that case.

Actual local web→Express→Neon HTTP verification used an existing owned synthetic
response and checked 13 outcomes: schedule/recover, exact duplicate, conflicting
new identity, stale revision, cancellation/repeated cancellation, recovered final
receipt, unknown keys, foreign workspace and malformed target. The request was
cancelled and the verification login signed out. The first attempted target was
an old webhook-test ID, correctly rejected as RESPONSE_NOT_FOUND without a write;
the actual synthetic response was then verified successfully.

All 63 database and 3 auth integration tests passed against the restricted shared
database with automated fixtures rolled back. All 86 API and 240 core/coverage
tests, 44 recovery tests, build/bundle, fast checks,
production audit and real Worker preview/reload checks pass. The web artifact is
unchanged: 208.05 KiB JS gzip, 8.59 KiB CSS, 36.07 KiB primary font. No dependency.
Deletion controls and their normal/power/adversarial browser journeys are the
next slice; these routes have not been deployed. Purge remains disabled.
