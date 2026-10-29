# ADR-022: Route performance budgets

Status: accepted by the user on 29 October 2026, before remaining V1 UI work.

The first-slice rule capped all emitted JavaScript at 200 KiB gzip, including
mutually exclusive lazy routes. The notification release already passes that
rule at 199.96 KiB. It is deployed independently of this decision; this update
does not hide a failing feature artifact.

The user approved these replacement limits: home 125 KiB, collector 170 KiB,
editor 190 KiB, inbox 175 KiB, any other route 200 KiB; all emitted JavaScript
including lazy code remains capped at 230 KiB. Existing CSS 20 KiB and primary
font 40 KiB limits remain, along with all correctness/security/latency gates.

The checker parses emitted JavaScript with the already installed TypeScript
compiler. It counts the entry, selected route and account layouts, transitive
imports, re-exports and non-route dynamic features once. Only dynamic imports of
other known routes are deferred; an eager import always counts. String/template
imports work; unresolved computed imports, missing/ambiguous artifacts, unbundled
external imports and paths escaping the artifact fail closed. The complete emitted
JS ceiling still counts every file. This adds no package or production code.

The initial static-only measurement was 118.28/159.08/181.11/157.17 KiB for
home/collector/editor/inbox. The stronger checker also accounts for dynamic
non-route modules and layouts: 119.34/160.14/182.35/158.40 KiB. These are conservative
artifact graphs, not observed browser transfer, execution time or production SLOs.
Third-party challenge scripts remain a separately disclosed platform cost.

Native Node tests first failed with the missing graph module. Additional tests
failed when dynamic feature imports/computed imports were omitted; the completed
checker covers cycles, shared dependencies, side effects, re-exports, template
imports, eager-route imports and failure cases. All current route artifacts pass.
Future routing/build changes must preserve deterministic accounting rather than
silently excluding an unknown chunk. No feature code is bundled eagerly to fit
the aggregate ceiling.
