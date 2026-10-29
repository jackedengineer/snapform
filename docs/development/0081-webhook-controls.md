# Authorized webhook controls — 30 October 2026

Shared strict contracts now bound send/retry context, enablement, preview output
and the latest 20 delivery metadata rows. History selects only identity, version,
state, reason, attempts, HTTP status and times; no payload, destination ciphertext,
signing secret or lease capability is selected. The database repeats workspace
authorization for both reads and mutations. Queue calls use the guarded SQL
transition; enablement serializes with settings edits and requires current
configuration/revision plus acknowledged verification. The existing database
trigger remains the final enablement boundary.

Tests first failed at missing contract/database modules. Two new pure tests pass
strict shapes, bounds, explicit duplicate-risk context and sensitive-field
rejection. The real runtime-role test passes metadata projection, unverified
enable rejection, settings revision changes, queued receipt and duplicate
rejection. The rollback operator additionally enables a genuinely recorded test
acknowledgment through the exported helper. All synthetic writes roll back; no
receiver request is implied by these state-machine fixtures. All 227 pure tests
pass with 99.82% lines / 100% functions / 99.54% statements / 98.23% branches.
Builds and route budgets pass; JS remains 202.04 KiB gzip, API 733.48 and Jobs
231.29. No dependency added. HTTP exposure, live receiver and normal/power/
adversarial browser checks remain before feature completion.
