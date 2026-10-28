# Competitor fieldwork — actual public product use

**Date:** 27 October 2026. **Method:** hands-on browser interaction using synthetic content. No paid accounts, purchases, private customer data or intentional publication. User chose to continue with public demos rather than supply account access. Observations describe this session/configuration, not exhaustive competitor capabilities or measured reliability.

## 1. What was actually tried

| Product | Task performed | Verified result | Boundary |
|---|---|---|---|
| [Jotform](https://www.jotform.com/build/) | Created temporary form; added email and long text; renamed/required field; opened Conditions and Show/Hide rule editor; preview; Fill Form; revision history | Saved-state timestamps, field configuration, condition inputs, AI-generated synthetic preview answers and revision history were visible | No authenticated settings, real delivery, cross-user conflicts, real submit, export, payments or durability tests |
| [Typeform template](https://www.typeform.com/templates/lead-generation) / [respondent flow](https://form.typeform.com/to/HXmtoB) | Started five-question lead template; entered synthetic name; intentionally invalid email then corrected it; chose services/support plan; reached final phone/submit step; navigated back | Clear inline invalid-email error, personalized wording, selection retained on back navigation; final step showed Submit answers | Did not submit a lead or enter a real phone; authoring required signup; no claim about all templates/settings |
| [Formless](https://formless.ai/) public showcase | Started demo; gave synthetic name; asked about switching to fields/review; asked website training; corrected name | It abstained on unavailable information, answered supported website-training question and acknowledged name correction | Demo knowledge cannot establish complete product feature absence |
| [Formless setup](https://formless.ai/get-started) | Opened no-account demo workspace, skipped tour, chose Just tell the AI, generated synthetic agency intake, ran its embedded preview with ambiguity/corrections/review requests | Editable seven-item journey and business description; correctly unresolved currency; changed budget/urgency/date; produced text record review when prompted | No publish, production data export or backend typed-value inspection; conversational prose is not proof of stored schema correctness |
| [Tally](https://tally.so/create) | Entered public editor; added intake text; opened block chooser; inserted long-answer block; tried Import form | Document-style authoring and rich field/logic menu available without signup; import opened signup gate | Import execution and paid settings not tested |

## 2. Reproducible observations

### O1 — Jotform offers strong baseline productivity and recovery

Sequence: open public builder → dismiss optional signup → Elements → Email → Long Text → field settings → rename to “Tell us about your project” → Required → Preview → Fill Form → revision timestamp.

The preview filled a plausible website-redesign brief, and history displayed changes plus undo/redo guidance. This directly contradicts any positioning that ordinary AI test data, autosave visibility, or undo alone is novel. The condition editor exposed IF/STATE/VALUE and action/target controls. No path trace/test assertion was visible in that inspected rule pane, but it may exist elsewhere or in another configuration.

Evidence: [condition editor](evidence/jotform-condition-editor.png), [AI preview fill](evidence/jotform-ai-preview.png), [revision history](evidence/jotform-revisions.png); matching `.txt` files preserve accessibility observations.

### O2 — Typeform has polished field validation and backward correction

Sequence: lead template → name → invalid email → error → synthetic valid email → services → support plan → phone/final submit → Back. Chosen service and support plan remained selected when revisited. The final phone step displayed a submit action, without a consolidated editable record review on that particular screen. The test did not inspect an optional review configuration or complete submission.

Implication: preserve focused presentation and clear inline validation. A customer-configurable review contract with direct field correction is worth testing for consequential intake data; it is not evidence Typeform universally lacks review capability.

Evidence: [final phone/submit surface](evidence/typeform-final-step.png), [accessibility snapshot](evidence/typeform-final-step.txt).

### O3 — Formless default profile text can contain unprovided factual assertions

Generation input specified a synthetic web-agency intake and company name “Example Studio — research only.” The generated draft populated an About you statement describing that company as a studio focused on research and exploration, despite no business background supporting that description. A generated welcome title and tone were also present.

The issue is factual provenance and approval, not fluent wording. A model should be allowed to propose brand copy, but an inferred business description must not become approved respondent guidance merely because generation succeeded. The inspected form was a demo draft; no unsupported business claim was published during this work.

Evidence: [generated draft](evidence/formless-generated-draft.png), [full accessibility snapshot with supplied brief and generated profile](evidence/formless-generated-draft.txt).

### O4 — Formless handled ambiguity and later corrections well in this sample

Synthetic input supplied website redesign/goals, “five thousand” with unknown currency and flexible timing. The response kept the currency unknown, asked what currency to record, and explicitly skipped a deadline for flexible timing. A correction changed budget to USD 7,500 and timing to urgent with 15 January 2027. The next response acknowledged these changes.

It then requested confirmation of project type already mentioned, adding a turn. This is one instance of reconfirmation; it does not establish a systemic defect. After an explicit review request it presented project type, goals, budget, urgency and deadline and asked for confirmation or edits. **Textual review is already possible.** No direct per-field edit control or standard-field switch was visible in the inspected preview, and backend typed values were not inspected.

Evidence: [ambiguity response](evidence/formless-ambiguity.png), [record review](evidence/formless-record-review.png), matching `.txt` files.

### O5 — Formless abstained appropriately in the public showcase

Asked about switching to standard fields and extracted-value review, it said it lacked the required information. Asked about website training, it described the supported section. Asked about editing previous answers and changing the name, it acknowledged the new name while saying it lacked information about viewing/editing history. This is evidence of bounded demo knowledge, not proof of backend functionality or product-wide absence.

Evidence: [correction/abstention](evidence/formless-correction.png), [snapshot](evidence/formless-correction.txt).

### O6 — Tally makes generic forms a difficult price-only market

The public editor exposed simple document-style creation and a menu with common fields, conditional logic, calculations, payments and signatures. I inserted a long-answer question without signup. The import entry was visible but required an account to continue. Homepage statements about free usage are vendor claims subject to fair-use terms, not independently tested entitlements.

Implication: a $49 product needs demonstrated workflow value. Simple form creation, “less clutter,” AI creation, or an import button alone cannot justify differentiation. Evidence: [block menu](evidence/tally-blocks.png), [snapshot](evidence/tally-blocks.txt).

## 3. Meaningful product gaps/opportunities ranked by business sense

These are opportunities inferred from the tested surfaces and target workflow. “Not visible here” is not “does not exist.” Validate with five target operators and paid-account checks before publishing comparison claims.

| Rank | Proposed capability | Evidence and confidence | Buyer value | Scope and tradeoff |
|---|---|---|---|---|
| 1 | **Intake-ready record and delivery preflight**: test the full path, inspect exact destination payload, see which required business context is missing | Rules/preview tested in Jotform; no complete output/delivery contract verified. Medium confidence as workflow opportunity, unproven market gap | Agency/startup avoids launching a beautiful form that sends unusable records | P0: extend existing preview/test to sandbox payload and readiness checklist; no extra CRM |
| 2 | **Direct editable answer review shared across fields/chat** | Formless produced textual review, but no direct field editing/switch was visible; Typeform sampled final step showed immediate submit. Medium for inspected UX, low for product-wide absence | Consultants/coaches can correct budget/date/contact easily and trust what is submitted | P0: one state model, candidate evidence, explicit confirmation, accessible direct edit |
| 3 | **Review AI business facts separately from brand copy** | Generated About you statement from synthetic name. High confidence for one observed generation | Avoid unsupported service/policy promises in a client's branded intake | P0: factual diff, source/“unprovided” label, explicit approval and publish block |
| 4 | **Executable logic and output explanation** | Inspected Jotform IF/action pane; no executable trace visible there. Medium opportunity confidence | Small teams understand why a question appears and what will be delivered | P0 rule list/test traces; defer graphical editor and exhaustive path explosion |
| 5 | **Guided migration with behavior coverage and cutover receipt** | Tally exposes import already; execution account-gated. Source report emphasizes compatibility hazards. Medium workflow hypothesis | Buyer can switch a live intake flow with less risk | Supported adapter/report/tests; do not market “one-click import” as unique |
| 6 | **Field-summary progress and answer reuse** | Formless accepted multiple facts, but one project-type reconfirmation added a turn. Low-to-medium from one sample | Lower respondent effort and abandonment | P0 acceptance tests for reuse/corrections, bounded follow-up budget; measure with repeated fixtures |
| 7 | **Small-team cost predictability** | Multiple broad incumbent surfaces and Tally free positioning; account billing not tested | Owner knows what the subscription covers and whether AI can exhaust it | P0 clear counters/caps, one plan initially; validate price with paid behavior |

## 4. Changes made to the blueprint after fieldwork

- Added FR-45 for separate factual-business-profile approval and provenance. This is mandatory before AI-generated knowledge can be published.
- Added FR-46 for business completeness policy and an intake-readiness checklist built from explicit customer rules, never model intuition.
- Added FR-47 for preview of exact sanitized destination payload, marked test events and end-to-end delivery preflight.
- Kept direct answer review, optional field fallback, bounded clarification and answer reuse as P0, while explicitly acknowledging Formless can already produce textual review and handle ambiguity.
- Kept AI test responses, undo and save visibility as baseline capability; no novelty claim.
- Retained Tally as the price/simplicity baseline and strengthened the requirement for paid, recurring workflow validation.

## 5. What still needs paid-account testing

Typeform authoring/version/concurrency and advanced AI settings; Jotform production conditional output, delivery receipts/retry and multiuser behavior; Formless submitted typed data/export, production integrations and review configuration; Tally import fidelity and full conditional behavior. Test quota exhaustion, cancellation, provider failures and access control only in authorized test workspaces.

No conversion rate, hallucination rate, availability, integration guarantee or broad feature absence was established by these sessions. The screenshots show individual configured experiences; they are not a representative user study.
