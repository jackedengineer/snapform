# Response deletion controls

1 November 2026. Only owners see the inline response data controls. Confirmation
requires exact `DELETE` and an explicit acknowledgement. The native form reports
and focuses invalid fields, keeps a stable operation UUID across retry, and shows
only server-confirmed status. The saved receipt/reference and cancellation
deadline survive refresh. Export is unavailable while owner status is unknown or
deletion is pending/completed. Cancellation restores export access; stopped
notifications are not resent. These controls remain local until integration.

The first build pulled TanStack Form's 13.71 KiB runtime into the inbox and failed
its 175 KiB budget at 179.96 KiB. Two-field confirmation now uses native required
inputs, custom validity and `reportValidity`, with the shared exact-match rule.
The main builder still uses TanStack Form. The measured artifact is 210.52 KiB
total JS gzip, 8.82 KiB CSS, 36.07 KiB primary font; inbox 166.25 KiB. Every existing
screen/total budget passes without an exemption or changed threshold.

Actual in-app browser, existing owned synthetic response:

- Normal: expand, exact confirmation and acknowledgement, schedule with visible
  pending state, read the server deadline/reference, refresh and cancel. Two
  complete cycles passed; both requests are cancelled and the response is kept.
- Power: rapid double-click produced one active receipt; hard reload retained
  that receipt. Keyboard Shift+Tab/Enter reached and cancelled it, then focus
  moved to confirmation. Refresh initially lost focus because of native disabled;
  a failing markup regression led to guarded `aria-disabled`, then browser focus
  was retained. Final scheduling/cancellation was rerun after cache corrections.
- Adversarial: incorrect case, missing acknowledgement and injection-shaped
  confirmation were rejected without scheduling; no HTML nodes were injected.
  A forged workspace route exposed neither answers nor deletion controls.

No horizontal overflow at actual widths 320, 768, 1024 and 1440; the 390×844 view
was visually reviewed. Native DOM assertions checked labels, valid description
references, one main landmark and heading levels. Console error/warning log was
empty. Private screenshots show scheduled and cancelled mobile receipts. These
checks do not establish production latency, field Core Web Vitals or a real-device
accessibility audit. Whole-workspace controls, metadata expiry, alert delivery and
purge activation remain separate tasks.

Final checks: 248 core/UI tests with unchanged coverage thresholds, 86 actual API
Worker tests, 42 Jobs tests, formatting/types/lint, production dependency audit,
build/bundle, production SSR/private binding checks and two dev reloads/three
auth-cleanup cycles passed. Database/auth foundations retain the 63/3 restricted
rollback-only verification recorded in 0120. No new dependency or integration was
substituted with memory storage.
