# Native answer settings

29 October 2026. Creators can configure text length, optional numeric bounds, number units, multiple-choice counts, calendar bounds and file counts. A native dialog uses an explicit Apply/Cancel boundary so intermediate numeric input is not serialized into the form definition. The dialog form is portaled outside the editor form; its submit event does not reach the parent React form.

The domain helper accepts only the expected setting names once each, preserves the field identity, parses explicit numeric syntax and reuses the shared strict block schema. Currency choices use the same pinned contract vocabulary as server validation; see ADR-016. Zero, negatives and decimal values remain distinct from an empty optional bound. Unsupported currencies, malformed dates, duplicate/unknown properties and invalid structural limits fail without mutating the original block. Inverted relationships remain safe draft data and are diagnosed by the existing publication compiler, as specified in ADR-015.

## Verification

- The new test suite failed with the missing helper, then four behavior cases passed. The complete unit suite passed 134 cases, including the cross-runtime currency regression. Formatting, strict types and lint passed. The pure-core coverage floor remains unchanged and passing.
- Normal browser: applied a short-answer maximum of 120, observed exactly one revision advance, reloaded and reopened the dialog with 120 retained. Applied and reloaded numeric values `-12.5`/`0`, then an optional empty maximum; exercised custom units and JPY, and left the example budget in INR.
- The pinned list offered 162 codes in the browser. ZWG, absent from the older browser catalog, saved through the real API and survived reload; the example was then restored to INR.
- Multiple-choice 1–2 selections, calendar bounds 2026-11-01 through 2026-12-31, three files and long-answer length 20–2000 all survived reload and were reopened in the production build. The owned QA form now demonstrates all nine answer types. This does not claim that public file upload/scanning is implemented.
- Power browser: Cancel and Escape restored focus to the settings trigger and retained the previous maximum. The modal initially focused its first input. Background controls were absent from the modal accessibility tree. Reverse Tab in the embedded browser could leave document focus to the browser host; forward Tab returned to the first dialog input. A custom JavaScript focus trap was not introduced or claimed. No screen-reader/real-device audit is claimed.
- Adversarial browser: maximum 501 was blocked by native validation with the dialog still open and revision unchanged. A literal HTML-shaped custom unit created zero HTML elements. Inverted text limits produced the existing diagnostic and correcting them removed it.
- A bounded owned-API probe authenticated a separate QA session and submitted six invalid definitions: unsafe numeric bound, unsupported currency, invalid calendar date, oversized text limit, forged file AI permission and unknown block property. All returned 422; a final read matched both the original revision and complete definition. The probe session was signed out afterward; no emails were sent and no test database was created.
- At 375px the dialog was 339px wide and about 646px high, with no horizontal overflow, no unlabelled controls and zero nested forms. Desktop and mobile native screenshots were visually reviewed. The production browser console reported no new errors/warnings during the pass.

Production build/API dry run and SSR/CSP/service-binding checks passed. Client JavaScript is 184.93 KiB gzip, CSS 5.17 KiB and the primary font 36.07 KiB. No dependency was added. The known upstream CSS sourcemap warning remains visible. 41 workerd tests, 14 real restricted database tests and 3 real auth integration tests also passed after the currency contract correction. This slice adds no migration, role, endpoint or cloud configuration.

[Desktop](../evidence/20-answer-settings-desktop.png), [mobile](../evidence/21-answer-settings-mobile.png), [production build](../evidence/22-answer-settings-production.png).

Source: [native HTML dialog behavior](https://developer.mozilla.org/en-US/docs/Web/HTML/Reference/Elements/dialog). Public collection, immutable publication and the remaining market V1 gates are still in progress.
