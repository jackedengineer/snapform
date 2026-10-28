# Snapform design system — Foundation 0.2

**Updated:** 28 October 2026 · Direction: **Expressive clarity**.

**Status:** Proposed product design system and local visual specimen. Not a final brand identity or validated usability result. Read with `design/tokens.json`, `design/tokens.css` and `design/system.html`.

## 1. Design contract

**Personality:** thoughtful, expressive, capable. Professional enough for a consultant's client, approachable enough for a solo coach, and efficient enough for an agency operator. The user should understand the next step, what has been saved, which facts are confirmed, and what will happen on submission.

**Principles:**

1. Trust comes from visible state: saved, proposed, confirmed, published and delivered mean different things.
2. The primary action belongs to the current job: add/edit in Build, verify in Test, commit in Publish, review in intake, recover in Deliveries.
3. AI appears as optional assistance. It cannot occupy the whole editor or hide ordinary fields.
4. Keep operational screens dense enough to work; give respondent screens space to think.
5. Use plain factual copy, specific validation errors and evidence-linked interpretation.

The public introduction earns attention through large geometric type, warm surfaces and one clear product story. The application earns trust through readable fields, stable layouts and visible outcomes. This division fits agencies, consultants and coaches selling expertise, and startup teams that need speed without an enterprise-looking tool. It is a positioning hypothesis to validate with paid pilots, not evidence of higher conversion.

### Reference direction

On 28 October 2026, the live [Formless landing page](https://formless.ai/) showed Satoshi typography, tightly tracked headings, dark/light contrast, a blue primary action and a typewriter-style headline. Use its typographic confidence and generous composition; retain original copy, marks and layout. The public [Mobbin web library](https://mobbin.com/explore/web/screens) and Front inbox example informed the quieter list/detail work surfaces. [Vibrant's hero collection](https://vibrant.design/) informed a product-led hero and visible workflow story, without adopting pixel landscapes or unrelated ornament. See [observations, alternatives and review evidence](08-design-direction.md).

Do not reproduce a competitor's identity or assume a public showcase proves its entire design system. Avoid looping text that delays meaning, oversized empty dashboards, decorative graphs, coercive upgrades, hidden save behavior and color-only status. The supplied pp. 26–29 wireframes still inform job separation. Product-gap fieldwork remains in [the competitor report](07-competitor-fieldwork.md).

## 2. Foundations and tokens

### Color

| Semantic token | Value | Role |
|---|---|---|
| `surface.canvas` | `#F7F6F2` | Warm ivory page background |
| `surface.panel` | `#FFFFFF` | Forms, editor panels and popovers |
| `surface.subtle` | `#EEEDE8` | Grouping and secondary surfaces |
| `surface.dark` | `#191A1B` | Limited marketing showcases; inverse text required |
| `surface.actionTint` | `#EDF0FF` | Selected option background |
| `text.primary` | `#191A1B` | Ink headings and body |
| `text.secondary` | `#56585C` | Supporting content |
| `text.muted` | `#686A6E` | Metadata, never hidden critical instructions |
| `text.inverse` / `inverseMuted` | `#FFFFFF` / `#BFC1C4` | Text on dark showcases |
| `text.inverseSecondary` | `#E2E3E5` | Secondary dark-surface controls |
| `border.default` | `#DDDDD6` | Structural dividers, not input outlines |
| `border.control` | `#85878B` | Input outlines |
| `border.selected` / `inverse` | `#91A4FF` / `#66696D` | Selection accent / control boundary on ink |
| `action.primary` / `hover` | `#3154F4` / `#2341D4` | Cobalt primary action with white text |
| `focus` | `#3154F4` | 2px ring, 4px offset in specimen; product minimum 2px offset |
| `brand.lime` / `peach` | `#E9F2B4` / `#FFD7C6` | Sparing showcase accents with ink text |
| `status.success` | `#17643A` | Confirmed/delivered text |
| `status.warning` | `#815309` | Needs review/pending text |
| `status.danger` | `#B42318` | Invalid/destructive text |
| `status.info` | `#234F91` | Informational notice |

State backgrounds are pale tints with corresponding dark text, never tint alone. Normal text ≥4.5:1, large text and meaningful graphical/control boundaries ≥3:1; verify actual combinations including customization. Muted tokens are not permission to render tiny low-contrast text. Dark mode is deferred from V1; tokens reserve semantic names to support it later.

### Typography

Use **DM Sans Variable**, self-hosted with a system fallback, for display and UI. This provides a rounded geometric voice close in spirit to the reference while keeping one font family and a clear open license. The Latin WOFF2 is 36,932 bytes; Latin Extended is 18,228 bytes and loads only when its Unicode range is needed. Ship the [OFL 1.1 license](../design/fonts/OFL.txt); provenance and package integrity are in [font notes](../design/fonts/README.md). Use `font-display: swap`; production must tune fallback metrics and measure layout shift. No Google Fonts runtime request is required. Use system monospace for IDs, payloads and code only.

| Context | Size / line height | Weight / tracking |
|---|---|---|
| Marketing display | Fluid 60–96 / 0.98 desktop; 44–56 / 0.98 narrow mobile | 550 / −0.065em; test real copy before tightening further |
| Page title | 40/44; 32/36 mobile | 550 / approximately −0.04em |
| Respondent question | 32/38 desktop; 26/32 mobile | 550 / −0.04em |
| Subsection | 18/26 or 24/32 | 550–600 |
| Body / field value | 16/24 | 400 / −0.01em |
| UI / supporting metadata | 14/20; metadata 13/20 | 400–500 |
| Caption | 12/18 | 400–500; never critical instructions |

Display type is for the public introduction, not response tables or builder controls. Inputs remain ≥16px to avoid mobile focus zoom. Body measure is 60–75 characters, shorter in a form. Balance headings, use pretty paragraph wrapping and tabular numerals for changing budgets, counts and durations. Do not add letter spacing to numeric values just to match a display heading. Test fallback fonts, zoom and long copy.

### Geometry

Spacing: 4, 8, 12, 16, 20, 24, 32, 40, 48, 64px. Canonical radii: micro 4px, controls 10px, panels 20px, marketing display 32px, pill 999px for navigation/marketing actions. Nested radii should relate to inset; smaller specimen elements may use 8/12/16px where the containing geometry calls for it. Borders 1px for structure/state. White panels on ivory do not need decorative shadows. Icons are original specimen SVGs, 16/20px with 1.5px stroke beside normal text; production uses one Lucide set with `currentColor`. Touch target ≥44×44px; compact desktop ≥40×40px, with no overlapping hit areas.

### Motion contract

| Interaction | Timing / travel | Reason and static fallback |
|---|---|---|
| Introduction entrance | 600ms, 16px upward, 80ms stagger across three semantic groups | Establish hierarchy once; content is readable without animation |
| Sample Collect → Review → Deliver | 420ms, 12px upward and fade | Explain the workflow after an explicit click; selected label and sample state also change |
| Hover / press | 120ms, named color/border properties | Responsive affordance; marketing pills may scale to 0.96 on press |
| Occasional panel feedback | Up to 180ms | Reserved token; do not delay saving or validation |
| Field entry, validation, correction, routine tabs | Immediate | Keep attention on the current task; no celebratory or staggered changes |
| Reduced motion / manual motion off | No animation, transition or smooth scroll; press scale 1 | Same content, actions and state remain available |

Entrance easing: `cubic-bezier(.16,1,.3,1)`; short UI transitions: `cubic-bezier(.2,0,0,1)`. Animate opacity/transform, not height or position. The sample sheet reserves space to reduce movement between stages. A new stage replaces the prior one without queued exits; no auto-advance or timer runs. A 10% review-speed control exists only in the local specimen and must not become a production setting by accident.

Do not ship infinite cursors, typewriter text that withholds the headline, parallax, particles, scroll hijacking, fake progress or animated financial counts. Add a motion library only when a measured interaction requires choreography that CSS cannot reasonably provide. Native CSS is sufficient for this version. Reduced-motion preference always overrides replay and review speed. Never animate an answer away before correction; preserve visible pending/error text while requests run.

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

Native HTML controls are preferred for ordinary input. TanStack Form owns input state, Query owns remote state, Router owns navigation and Store holds bounded editor state; none replaces the canonical form engine. Radix handles modal/popover mechanics; our engine decides applicability and requiredness. Razorpay checkout is paired with Snapform-owned billing management, consistent with the existing status/cancellation design contract.

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

Tokens in JSON/CSS are canonical values; components consume semantic names rather than arbitrary hex/spacing. The specimen illustrates the public introduction, typography, motion, controls, candidate review, delivery and four audience examples; it does not contain an actual LLM, persistence or backend. Product components should receive Storybook stories for default, pending, validation, permission, network and empty states.

Before accepting a component: verify token use, keyboard/focus, screen-reader name/description, contrast, mobile/zoom, long content and error recovery. Before accepting a journey: observe at least five representative users across the target segments. Ask users to publish a branching form, repair a value, and find a failed handoff without instruction. Fix severe comprehension issues before applying decorative polish.

V1 design deliverables: token files; component state inventory; builder/publish/intake/review/results/delivery/billing flows; original segment templates; usability evidence and accessibility report. A full Figma library, finalized logo and all production screens remain implementation work, not claimed completed by this specimen. Foundation 0.1 is retained under `design/archive/foundation-0.1/` for comparison. Foundation 0.2 changes the design direction without changing the V1 scope. The subsequent platform revision uses TanStack Start/Form/Query/Store, Neon, R2 and Razorpay; see `docs/09-platform-stack-decision.md`. Component visual/interaction contracts still apply.
