# Synthetic webhook preview — 30 October 2026

A shared deterministic generator creates test payloads from the published form
definition, never stored responses. It respects text/number/date/choice bounds,
uses an example.invalid email and explicit test type/flag, and evaluates the same
conditional-path contract as collection. Unsupported files/invalid definitions
fail closed. Synthetic response identity equals the test delivery identity;
there is no corresponding response/session record.

The authorized preview operation requires current configuration/revision and an
active publication, serializes with form edits, and stores only a preview job.
Repeated operation IDs read the same exact bytes/time; reusing an ID for a new
configuration conflicts. API-role RLS remains authoritative. No send, response
session, response event, usage reservation or verification is created.

Both test suites failed first at their missing implementation modules. Tests
cover deterministic values/bounds and the actual restricted Neon login's preview
creation/retry, stale/foreign configuration, unauthorized workspace, forged
payload input and configuration replacement. Every database fixture rolls back;
the test confirms no residual fixture user. All 49 database and 225 pure tests
pass; pure coverage is 99.82% lines, 100% functions, 99.54% statements and 98.23%
branches, including the new generator. Formatting/types/lint pass after correcting
test formatting. Builds and all approved screen budgets pass: total JS 202.04
KiB gzip, inbox 160.45, editor 182.43, collector 160.18, home 119.35; CSS 7.97 and
font 36.07. No dependency added. API/UI exposure and browser send/repair workflows
remain next; this storage slice performs no HTTP and is not a delivery claim.
