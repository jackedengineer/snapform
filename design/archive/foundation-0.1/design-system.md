# Snapform design system — Foundation 0.1

**Status:** Proposed product design system and local visual specimen. Not a final brand identity or validated usability result. Read with `design/tokens.json`, `design/tokens.css` and `design/system.html`.

## 1. Design contract

**Personality:** clear, composed, capable. Professional enough for a consultant's client, approachable enough for a solo coach, and efficient enough for an agency operator. The user should understand the next step, what has been saved, which facts are confirmed, and what will happen on submission.

**Principles:**

1. Trust comes from visible state: saved, proposed, confirmed, published and delivered mean different things.
2. The primary action belongs to the current job: add/edit in Build, verify in Test, commit in Publish, review in intake, recover in Deliveries.
3. AI appears as optional assistance. It cannot occupy the whole editor or hide ordinary fields.
4. Keep operational screens dense enough to work; give respondent screens space to think.
5. Use plain factual copy, specific validation errors and evidence-linked interpretation.

Avoid purple gradients, chat-first funnels for simple enquiries, oversized empty dashboards, decorative graphs, coercive upgrades, hidden save behavior and color-only status. Study the supplied pp. 26–29 wireframes for job separation; use original branding and composition. Live competitor findings are in `docs/07-competitor-fieldwork.md`.

## 2. Foundations and tokens

### Color

| Semantic token | Light value | Role |
|---|---|---|
| `surface.canvas` | `#F6F7F5` | Page background |
| `surface.panel` | `#FFFFFF` | Editor panels, forms, popovers |
| `surface.subtle` | `#EEF1ED` | Grouping/secondary controls |
| `text.primary` | `#18231D` | Headings and body |
| `text.secondary` | `#4C5C52` | Supporting content |
| `text.muted` | `#626F66` | Metadata; not disabled critical content |
| `border.default` | `#CAD2CB` | Dividers/surfaces; not sufficient alone for input boundaries |
| `border.control` | `#7B887E` | Input outlines with ≥3:1 contrast against white |
| `action.primary` | `#175C40` | Main action with white text |
| `action.hover` | `#10472F` | Hover/pressed surface |
| `focus` | `#2563EB` | 2px ring plus 2px offset |
| `status.success` | `#17643A` | Confirmed/delivered text |
| `status.warning` | `#815309` | Needs review/pending text |
| `status.danger` | `#B42318` | Invalid/destructive text |
| `status.info` | `#234F91` | Informational notice |

State backgrounds are pale tints with corresponding dark text, never tint alone. Normal text ≥4.5:1, large text and meaningful graphical/control boundaries ≥3:1; verify actual combinations including customization. Muted tokens are not permission to render tiny low-contrast text. Dark mode is deferred from V1; tokens reserve semantic names to support it later.

### Typography

Use a system sans-serif stack (`ui-sans-serif`, `-apple-system`, BlinkMacSystemFont, Segoe UI, sans-serif) at launch, avoiding font downloads and license complexity. Use system monospace only for IDs, payloads and diagnostic code. Optional licensed variable font is a later branding decision.

Type scale: caption 12/18, metadata 13/20, UI 14/20, body/input 16/24, subsection 18/26, section 24/32, page 32/40. Respondent question 28/36 desktop, 24/32 mobile. Weight 400 body, 500 labels, 600 headings/actions. Body line length 60–75 characters. Inputs ≥16px prevent mobile focus zoom. At zoom/reflow, no clipped labels or overlapping controls.

### Geometry and motion

Spacing tokens: 4, 8, 12, 16, 20, 24, 32, 40, 48, 64px. Radius: 4px micro, 6px controls, 10px panels, pill only for compact status. Borders 1px; no default decorative shadows; elevated popovers may use a subtle approved shadow later. Icons 16/20px with 1.5–2px stroke. Touch target product target ≥44×44px; compact desktop icon visuals still have a ≥32px hit area and meet WCAG target-size/spacing requirements.

Transitions 120ms hover/focus, 180ms panel/feedback; animate opacity/transform rather than layout. Reduced-motion removes nonessential motion. Never animate an answer out before the user can correct it. Skeletons for loading content; no misleading numerical AI progress.

## 3. Information architecture

Workspace shell: Forms, Responses, Deliveries; owner-only Workspace settings and Usage & billing. Help and workspace switcher stay discoverable. Empty Forms offers template/import/blank; avoid showing analytics charts before real data exists.

Form workspace: **Build → Logic & test → Knowledge → Share → Results**. Publish is an explicit primary button with validation and a review dialog; it is never equivalent to autosave. Knowledge is optional and can be hidden when AI is disabled. Integrations/delivery settings sit under Share with a clear destination test.

### Screen contracts

| Screen | Main job/action | Required information/states |
|---|---|---|
| Onboarding | Choose first workflow → create draft | Segment template, purpose, destination need, brief/import alternative; no forced AI |
| Form list | Resume work → open form | Draft/live/paused, last update, genuine response count, quick duplicate |
| Builder | Change one field → save draft automatically | Outline, actual collector preview, field inspector, save/conflict state, optional AI diff panel |
| Logic & test | Understand routing → run examples | Rule list, referenced fields, expected/actual outcome, trace and blocking issue links |
| Publish review | Commit intended version → Publish | Target revision, changed fields/rules, theme/knowledge version, diagnostics, delivery test result |
| Public intake | Supply relevant data → Review | Business identity, purpose, privacy/save notice, help, back/next, optional guided mode |
| Review | Confirm the effective record → Submit | Proposed/missing/confirmed values, original evidence where needed, direct Edit, explicit acknowledgment |
| Response detail | Understand enquiry → act externally | Original vs confirmed fields; staff notes; private attachments; delivery receipts |
| Delivery detail | Repair handoff → safe retry | Target, event/mapping version, last attempt, error, next retry, unknown-state warning |
| Usage & billing | Predict cost → manage plan | Counters with definitions, allowance/reset, estimated charge, hard cap and cancellation date |

## 4. Responsive layouts

Creator desktop ≥1280px: 240px navigation/outline, flexible center preview (min 480px), 320px inspector. Optional AI replaces inspector or uses a drawer; do not stack four columns. At 1024–1279px, collapse global navigation and show one side panel at a time. At 768–1023px use outline/preview/inspector tabs. At <768px support account/results and simple label/value edits; show clear desktop recommendation for complex form/logic authoring without blocking response collection.

Respondent form max 720px; card max 640px; comfortable padding 32–40px desktop and 20px mobile. Guided mode uses conversation plus 280px answer summary when width permits. Mobile summary is an expandable region with a persistent Review action; switching modes does not reset session or accepted values. No nested scrolling for the core mobile form. Sticky actions must not cover errors or focused inputs, including when software keyboard opens.

Test 320, 375, 768, 1024 and 1440px, portrait/landscape where applicable, 200% zoom, long names, long translations (for future readiness), screen-reader mode and text-only content. V1 language is English; layout should not assume five-character labels.

## 5. Components and interaction states

| Component | Variants | Required states / behavior |
|---|---|---|
| Button | Primary, secondary, tertiary, danger | Default/hover/focus/pressed/disabled/pending; preserve label while pending; one main action per local context |
| Field | Text, textarea, number/unit, email, date, choices, acknowledgment, file | Label, required text, hint, value, error, disabled/read-only, saving/saved; error via `aria-describedby` |
| Choice | Single/multiple cards or native group | Selected, focus, unavailable; keyboard group behavior; no mandatory auto-advance |
| SaveStatus | Saving/Saved/Offline/Conflict/Failed | Timestamp and clear resolution; never display Saved before server acknowledgment |
| CandidateReview | Proposed/Needs detail/Confirmed/Edited | Source turn/quote, normalized value, direct edit/confirm; no misleading confidence percentage |
| AIProposal | Add/change/remove operation list | Base revision, dependency impact, apply/discard, stale/error; field diff separate from business factual assertions |
| LogicIssue | Error/warning/test result | Stable field/rule links and reproducible input; text explanation accompanies icon/color |
| Upload | Empty/progress/quarantined/clean/rejected/expired | File limits before choose; cancel/retry; status explains whether submission can finish |
| DeliveryStatus | Pending/in progress/delivered/retrying/needs action/unknown/failed | Attempt count/time, destination, sanitized failure and safe action; Delivered means acknowledged by destination |
| Table | Results/deliveries | Sort/filter/cursor, loading/empty/error, row actions, responsive detail alternative; no solely hover-revealed action |
| Dialog/drawer | Publish, delete, invite, conflict, retry | Accessible title/description, focus trap/restore, escape except critical in-progress action, specific action labels |
| Notice/toast | Info/success/warning/error | Inline persistent errors for blocked tasks; toast supplemental, never the sole proof of submit/save |
| Progress | Deterministic pages or collected field count | Actual known denominator; chat uses collected requirements, not fabricated remaining turns |

Native HTML controls are preferred for ordinary input. Radix handles modal/popover mechanics; the form engine, not a UI library, decides applicability and requiredness.

## 6. Copy and truthfulness rules

- “Draft saved at 14:32” versus “Version 3 is live.”
- “We found USD 7,500 in your message. Confirm or edit.” versus “We know your budget.”
- “Choose a currency” versus “Invalid input.”
- “Your response is saved. The webhook is retrying.” Distinguish collection and delivery.
- “AI is taking longer. Continue with fields” remains visible and usable immediately.
- “Your answers are saved for 7 days on this device/session” must match actual server/browser recovery behavior; identify the business receiving submitted data.
- AI-generated business facts and tone choices are marked Proposed. Facts are never silently inferred from a company name or website domain and published as policy.
- Destructive actions name the object and consequence; billing cancellation shows effective date and access/retention effects before confirmation.

Avoid fake testimonials, unverified conversion promises, celebratory messages on pending operations, “train your model” when supplying context, or “secure/compliant” without precise scope.

## 7. Accessibility contract

One descriptive H1/page; valid heading order; visible labels; semantic form/fieldset/legend; focus visible and not obscured; errors linked and summarized on failed submit; polite live regions for save/AI status; no announcement of every streaming token. Distinguish errors beyond color. Keyboard operation covers drag alternatives, dialogs, menus, condition editor, switching modes, review and submit. Explicit IME composition handling and no surprise focus jumps.

Use labels “Required”/“Optional,” not an unexplained asterisk. Never require a mouse to inspect evidence or repair an answer. Provide a skip link and accessible iframe title. Screenshots and automated checks do not establish screen-reader success; record manual assistive-technology results.

## 8. Design governance and implementation handoff

Tokens in JSON/CSS are canonical values; components consume semantic names rather than arbitrary hex/spacing. The specimen illustrates colors, controls, candidate review, delivery and three audience examples; it does not contain an actual LLM, persistence or backend. Product components should receive Storybook stories for default, pending, validation, permission, network and empty states.

Before accepting a component: verify token use, keyboard/focus, screen-reader name/description, contrast, mobile/zoom, long content and error recovery. Before accepting a journey: observe at least five representative users across the target segments. Ask users to publish a branching form, repair a value, and find a failed handoff without instruction. Fix severe comprehension issues before applying decorative polish.

V1 design deliverables: token files; component state inventory; builder/publish/intake/review/results/delivery/billing flows; original segment templates; usability evidence and accessibility report. A full Figma library, finalized logo and all production screens remain implementation work, not claimed completed by this specimen.
