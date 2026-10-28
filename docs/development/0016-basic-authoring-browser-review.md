# Basic authoring browser review

28 October 2026. Verified accounts can open a workspace, list its cursor-paged forms, create a blank form and edit a persisted draft. The account layout stays mounted across private navigation. The editor supports question labels/descriptions/requiredness, choice options, basic number units, fresh-identity duplication and keyboard reordering. Native controls and semantic CSS use the existing TanStack/React stack; no dependency was added. Recursive rule programs stay outside TanStack Form’s deep field-path model, while editable document values use TanStack Form. Strict types remain enabled without casts to any or suppressions.

## Actual normal-user checks

The approved QA identity opened its agency workspace, saw an empty form list, double-clicked New form and received one form. It added required name/email questions and a service choice, saved through the actual Express Worker and reloaded the persisted labels/help/requiredness/options. Returning to the list showed exactly one form. The production build then loaded that record, saved a new helpful description through its service binding and retained it after reload. Saving a temporarily blank label remained distinct from publish readiness: the draft acknowledged the save and displayed the blocking missing-label diagnostic.

## Actual power-user checks

An unsaved duplicated choice received independent IDs and retained independent option values. Changing its first option left the original unchanged. Reordering worked with native keyboard activation; the new unsaved copy was then removed before saving. Two browser tabs started at the same revision and sent competing writes: one saved, the other conflicted. The second tab retained its title, loaded the newer saved copy, restored its own alternative and explicitly saved it as a new revision. This was a real overlapping HTTP/database journey, supplementing the sequential rollback tests.

Browser review found and fixed three defects before commit: a diagnostic condition was accidentally placed in the conflict panel and crashed its rendering; TanStack reset values were then overwritten when the hook synchronized its original options; and a move button becoming disabled lost keyboard focus. A standalone conflict rendering test now covers that branch. A real FormApi regression test verifies recovery survives option synchronization and restores the local alternative. The editor uses keepDefaultValues for those replacements, tracking server acknowledgment separately. Boundary reordering now returns focus to the selected question. The global error message also no longer falsely claims a brief was not sent.

## Actual adversarial checks

HTML-shaped question text remained inert text after save and reload; the editor contained zero injected images. A bounded native HTTP probe used only the owned QA account and revoked its temporary session afterward. Forged actor fields returned 422; stale writes and operation-identity reuse returned 409; a wrong workspace/form pair returned 404; malformed cursors returned 422; oversized bodies returned 413; foreign-origin mutations returned 403. Reading afterward confirmed no rejected write advanced the revision. This probe did not send email. Cross-user/viewer RLS tests use rollback-only database fixtures; separate viewer browser identities were not claimed tested here.

## Layout, accessibility and performance evidence

320, 375, 768, 1024 and 1440px document widths matched their viewports. Visible action targets measured at least 44px; form/option controls had accessible labels, IDs were unique, and the editor had one main landmark and one level-one heading. Mobile titles now wrap; numeric/control fonts preserve normal mobile sizing. Motion uses CSS opacity/transform and respects reduced motion. These DOM/manual keyboard checks are not a claim of a complete assistive-technology or real-device audit. No warning/error console entries were captured during the final production journey.

115 unit tests, 41 workerd tests, 14 database tests and 3 auth integration tests pass. Implemented pure-core coverage: 100% lines/functions, 99.74% statements and 99.34% branches. Formatting, strict types, lint, production builds, SSR/unique CSP nonces, service binding, two API reloads/three real auth cleanup cycles and production dependency audit pass. The upstream CSS sourcemap warning remains visible. Client JS: 179.65 KiB gzip; CSS: 4.91 KiB; primary font: 36.07 KiB; standalone API dry-run: 712.71 KiB gzip. These local measurements do not establish hosted production SLOs.

Evidence: [form list, development browser](../evidence/13-form-list-desktop.png), [production editor desktop](../evidence/14-form-editor-desktop.png), [production editor mobile](../evidence/15-form-editor-mobile.png).

## Remaining authoring gates

This slice uses explicit manual saving and an in-memory conflict alternative. Autosave, durable local pending-operation recovery, full field constraints, page management, rule editing/path inspection, templates, respondent preview and immutable publication remain subsequent work. Removal of historical/published fields and its dependency warning/undo flow were not tested by removing the new unsaved QA copy. No public response, notification, AI result, file scan or payment is claimed delivered. The market V1 remains incomplete.
