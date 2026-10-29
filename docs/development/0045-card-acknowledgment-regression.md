# Card acknowledgment regression — 29 October 2026

The deployed normal-user journey caught a control that the earlier local
review missed. The card-mode rule hiding repeated field labels also matched
the acknowledgment's interactive label. Its box was 1 px wide with
`clip-path: inset(50%)`; the browser's actual checkbox check action failed.

The fix excludes `.intake-option` from the field-title selectors at desktop,
mobile and card mode. Option labels retain their flex layout and padding;
only the repeated non-interactive title is visually hidden.

The same browser diagnostic after deployment measured a 640 × 80 px target
with no clip. Checking it succeeded, final review showed the checked answer,
and submitting produced a durable receipt. The exact owned synthetic response
was independently checked in Neon: one record, submitted status, submission
timestamp and ending identity present. No usage counter was reset.

Power/recovery: refreshed the deployed form, recovered earlier answers, and
advanced through all seven applicable questions. Adversarial: markup-like text
remained literal in review and no injected image element existed. This is a
real browser regression check, not an assertion that a source selector exists.
No runtime dependency or JavaScript was added. Production build and unchanged
bundle gate pass: JS 199.53 KiB gzip, CSS 6.98 KiB, font 36.07 KiB.

[Production receipt](../evidence/43-production-submission.png).
