# Remote ledger restore drill

1 November 2026. The backup pipeline now validates the separate read-only ledger
credentials and encryption key before export. After verifying the uploaded R2
archive byte for byte, it upgrades the isolated restored schema, authenticates
the complete bounded ledger/SQL union, replays deletions and quarantines sessions
and pending deliveries. A SQL intent without a retained authenticated object is a
hard failure: the CI reader cannot create or repair ledger records.

The combined result reports authenticated replay and quarantine only after those
steps return successfully. It always reports `trafficSafe: false`. The basic
snapshot-only CLI retains its truthful `not-exercised` result. A later iterator
failure or corrupt object prevents all SQL purges; no private provider diagnostic
is emitted. Behavioral tests failed before orchestration and configuration guards
were implemented. Read-only review found no required correction.
All 44 recovery tests and formatting/types/lint checks pass. This Node/workflow
change adds no dependency or browser/Worker code; the preceding slice's unchanged
build, budget and real Worker boundary evidence is recorded in 0117.

The actual live drill created a 242,668-byte encrypted backup at
2026-11-01T13:46:23.963Z, verified remote roundtrip bytes and restored all 38
migrations. The isolated restore/inspection took 4,421 ms with network `none` and
zero published ports. SQL pending and R2 objects both numbered zero; replay and
quarantine passed and the temporary container/plaintext were removed. This is
real empty-ledger evidence, complemented by the nonempty synthetic SQL regression
in evidence 0117. It does not establish a nonempty live-ledger or hosted run.

The manual workflow now installs exact locked dependencies and runs the complete
recovery suite before the live backup/replay step. Nightly scheduling remains off
until the hosted run and failure/freshness alert delivery are verified. The reader
does not authorize reopening restored traffic. An authoritative restore still
requires quiescing collection and all jobs before obtaining its ledger listing;
UUID pagination under concurrent writes is not an authoritative checkpoint.
