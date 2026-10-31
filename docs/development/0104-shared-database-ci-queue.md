# Queue verification against the shared database

One hosted owner-deletion run passed pure/Worker/Jobs tests and 55/56 database
tests, but an existing notification-settings fixture exceeded its unchanged
30-second limit. The full local 56-test database suite passed. Several branch
checks were simultaneously exercising the one Neon database; live migration
preflight also encountered its five-second DDL lock limit. This evidence does
not establish that all latency was caused by CI concurrency.

The Verify job now uses GitHub's native repository-wide concurrency group with
queue: max. Checks on different branches wait instead of overlapping their
shared-database work. The existing per-ref workflow cancellation still discards
superseded runs on that same ref. Every required test, assertion, coverage/bundle
budget and the 15-minute execution timeout stays unchanged. Queue waiting does
not replace a passing required check; merge remains blocked until the exact head
passes. No second database, custom lock service or runtime dependency is added.

[GitHub's concurrency documentation](https://docs.github.com/en/actions/how-tos/write-workflows/choose-when-workflows-run/control-workflow-concurrency)
specifies queue: max with cancel-in-progress: false, allowing multiple pending
checks rather than replacing an older pending run. Hosted acceptance and the
subsequent exact-head checks must be verified after pushing this configuration.
