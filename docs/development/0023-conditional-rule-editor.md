# Bounded conditional rule authoring

29 October 2026. Creators can author up to thirty ordered rules through native controls: show a question, navigate to a later page, or finish with a selected completion message. Conditions support typed comparisons and bounded all/any/not groups (eight children, four levels). The existing compiler diagnoses forward dependencies, invalid comparisons and backward navigation beside the affected rule. Draft saving remains structurally permissive; this UI does not publish invalid definitions or silently rewrite references.

The pure editing helpers first failed before implementation, then passed stable-ID, cap, priority/reordering/removal and typed-operator cases. An empty-choice regression first failed and now exposes presence comparisons until options exist. A further test checks every offered initial comparison across all nine answer types against the actual compiler. All 152 units passed, with unchanged passing pure-core coverage. No dependency, endpoint or migration was added.

## Actual browser review

Normal: authored three saved rules in the agency form: show budget when Website design is selected; show extra services when budget is at least zero and the initial question is answered; and finish the first page with an alternate message when Not sure yet is selected. The now-referenced alternate completion cannot be removed in form settings. Reload preserved the rule IDs, grouped conditions, choice identities and numeric zero.

Power: moved the finishing rule up and back with Enter, preserving its identity and returning focus to its summary. Created thirty rules and confirmed further creation was disabled; removed the 27 temporary rules, leaving the three meaningful rules. A temporary group reached eight children and four levels, where additional nesting was unavailable. Changing all to any preserved all eight children. Native group removal initially dropped focus to the document; a failing browser observation reproduced it. Addition/removal now focuses the new or nearest surviving condition selector, verified with Enter after the fix.

Adversarial: selected a backward destination; the rule immediately showed “Navigation must move to a later page.” Correcting source/destination cleared the diagnostic. Five owned API requests (31 rules, nine children, excessive depth, executable-shaped unknown operator, unknown action property) all returned 422; revision and complete saved definition stayed unchanged. The probe's own session was cleaned up.

A separate read-only check loaded the actual saved form and evaluated three synthetic paths through the shared engine. Website design retained a zero budget and visited both pages; Not sure yet selected the alternate ending and excluded answers from hidden/skipped questions; Brand strategy selected the default ending and excluded the hidden budget. This is evaluator evidence against the saved definition, not a respondent-browser submission or a published intake test.

Desktop and 375px review found labelled controls, no horizontal document overflow at four-level nesting, and no production console errors/warnings. The temporary viewport was reset and temporary rules removed. [Desktop](../evidence/29-conditional-rules-desktop.png) and [mobile](../evidence/30-conditional-rules-mobile.png) are native captures. Final saved state: three rules, two pages, two endings and the original ten blocks.

Types, lint, formatting, production web/API builds and SSR/CSP/service-binding checks passed. Client JavaScript is 188.99 KiB gzip, CSS 5.46 KiB and the primary font 36.07 KiB. The upstream CSS sourcemap warning remains visible. Immutable publication, real respondent intake, and other market V1 capabilities remain unfinished.
