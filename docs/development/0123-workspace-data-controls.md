# Workspace data and retention controls

1 November 2026. This local slice adds owner workspace deletion controls and
integrates the previously reviewed retention policy controls. It is not yet an
application deployment or permission to enable permanent purge.

## Behavior

- Data and privacy follows the form list. Owner deletion requires the exact
  workspace name and an explicit acknowledgement of the 24-hour cancellation
  window. Pending deletion stops collection and changes; the page disables new
  forms and retention changes while status is pending or cannot be confirmed.
- The pending banner links to the data controls and focuses their heading.
  Cancellation uses the saved receipt and revision. The initiating owner can
  recover a minimal completed workspace receipt after the workspace is removed;
  the receipt does not expose forms, answers or credentials.
- Retention uses native required acknowledgement and supported periods. A
  retired mutation cannot cancel a remounted reader or replace its cache. The
  API maps a pending-workspace policy write to a fixed 409 response; the client
  displays fixed guidance rather than provider diagnostics.

## Actual checks

Behavioral regressions were demonstrated RED then GREEN for the retired
retention writer, pending-workspace status mapping and completed receipt UI.
Core/UI tests: 256 passed; pure-contract coverage statements 99.18%, branches
97.75%, functions 100%, lines 99.84%. Actual workerd API tests: 89 passed.
Formatting, types, lint, build and bundle gates passed. Production SSR/CSP,
service bindings and two development reloads passed. The isolated preview check
initially refused the occupied dev port; it passed after stopping only this
workspace's dev process. No threshold or check was removed.

In-app browser, existing owned synthetic QA workspace:

| Journey | Expected and observed |
| --- | --- |
| Normal | Required retention acknowledgement prevented submission; 365 days saved and survived reload; original 90-day policy restored. |
| Normal | Workspace schedule displayed one receipt, froze creation/policy controls and stopped the owned collector. Cancellation kept the data and restored collection and creation. |
| Power | Double-click produced one active receipt; reload recovered the same receipt. Banner navigation and mutation completion moved keyboard focus to the intended heading/status. |
| Adversarial | Injection text stayed inert and failed exact-name validation. A forged workspace URL exposed no forms, retention or deletion controls. Worker tests reject writes while deletion is pending. |

The workspace request was cancelled; no permanent deletion occurred. Responsive
DOM checks confirmed viewport equals document width at 320, 768, 1024 and 1440px.
A 390×844 screenshot was visually reviewed. Native label/description checks
found no unlabelled fields or broken descriptions; console warnings/errors were
empty. This is not an axe, screen-reader or real-device certification.

Private screenshot evidence is stored outside Git in `.recovery/`. Final build:
213.77 KiB total JS gzip, 9.51 KiB CSS gzip, 36.07 KiB primary font. Workspace
route 164.33 KiB; inbox 167.41 KiB; collector 161.43 KiB; editor 183.65 KiB.
All approved budgets pass. These artifact sizes do not establish production
latency, INP or CLS targets. No dependency was added.

## Remaining release evidence

The completed-workspace browser journey still requires a disposable fixture and
the actual ledger-backed purge drill. Isolated SQL and UI tests cover that
receipt path today. Permanent purge remains disabled. Metadata expiry,
operational alert delivery, scheduled backups and final deployed journeys remain
separate gates; this slice does not mark the six-stream showcase complete.
