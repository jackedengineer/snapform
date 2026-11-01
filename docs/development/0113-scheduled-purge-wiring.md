# Scheduled purge wiring (activation off)

1 November 2026. The Jobs scheduled handler now processes due owner deletion
before expiry work, validates its stable ledger key/bucket before claiming, and
uses the existing conditional encrypted R2 ledger before calling the response or
workspace finalizer. Claim batches remain bounded to 20 each. Failures remain
retryable, emit counts without content, and fail the scheduled invocation after
unrelated delivery work can finish. SQL finalization remains idempotent.

`PURGE_ENABLED` is explicitly `0`. Only the exact value `1` activates it. The flag
owner is the Snapform operator; review activation readiness by 8 November 2026
and remove the temporary activation gate within two weeks after full rollout.
Do not enable it until authenticated restore replay, independent key custody,
failure/freshness alerts and the final destructive-workflow checks pass. No live
retention deletion was activated by these tests; synthetic claims/finalization
were rolled back. This slice is not yet deployed; see 0114 for the actual preview
baseline and verified rollback versions.

Workspace intent validation now requires an owner request targeting its own
workspace, matching the SQL constraint. A malformed target was accepted before
the new failing contract test and is rejected now. No dependency was added.

## Verification

- The real scheduled-handler regression fails against the previous Worker:
  it never invokes the finalizers and ignores the invalid-key activation case.
  With the new handler it passes, including connection cleanup. Database
  commands are stubbed in that wiring test; R2 and Web Crypto run in workerd.
- All 42 Jobs and 240 core tests pass. Core coverage is 99.84% lines, 100%
  functions, 99.18% statements and 97.75% branches. Tests check disabled/missing
  configuration, owner-before-expiry order, ciphertext acknowledgement before
  finalization and a conflicting ledger not deleting its target.
- The real Neon operator probe verifies mapped owner claims and the workspace
  helper's idempotent completion alongside existing quota/audit and authorization
  assertions. Every synthetic write rolls back. No provider HTTP is involved.
- Native configuration/type generation, formatting, strict types and lint pass.
  All 84 API tests, production builds and bundle gates pass: emitted JS is
  208.05 KiB gzip, CSS 8.59 KiB and font 36.07 KiB. Production latency and Web Vitals
  are not established by these artifact measurements.
  This slice changes no browser UI. Browser normal/power/adversarial delivery
  evidence is in 0112; owner deletion controls still need their later UI gate.

Cloudflare's [scheduled-controller test helper](https://developers.cloudflare.com/workers/testing/vitest-integration/test-apis/)
is used for the event-handler test. This establishes the Worker wiring and local
R2 ordering, not production activation or a successful disaster-recovery replay.
