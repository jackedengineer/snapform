# Webhook dispatch boundary — 30 October 2026

Jobs now has a small dispatch function and typed database calls for claim,
prepare and record. It decrypts the tenant-bound destination, creates a payload
from the pinned response only on its first attempt, and persists it before HTTP.
Retries revalidate and send the stored bytes. Invalid configuration or payload
never reaches the receiver. Thrown sends become Unknown. A failed record is
counted as failed, never acknowledged or immediately resent; lease expiry remains
the recovery boundary. Counters contain no URLs, keys, answers or diagnostics.

Tests were added first and failed at the missing dispatch module. All 28 Jobs
tests now pass in workerd, including prepare/send/record ordering, exact retry
bytes, pinned first payloads, empty claims, invalid encryption/snapshots,
rejected preparation, uncertain sends, stale records and database outages.
The Neon operator rehearsal also exercises the exported database calls inside
its rollback-only transaction, asserting normalized missing answers and exact
payload equality. It passes and confirms fixture rollback. Actual Jobs login
privileges remain verified separately; no role switching or new database.

Formatting, types, lint and production builds pass. Client JS remains 201.98 KiB
gzip, inbox 160.43 KiB, CSS 7.97 KiB, primary font 36.07 KiB. No dependency was
added. The dispatcher is not yet imported by the Worker entry: no live sender or
new browser control is activated by this slice. Private wake/Cron wiring, explicit
preflight/send/history/retry UI, real receiver and concurrent-connection checks
are the next gates; these unit/runtime checks do not establish their completion.
