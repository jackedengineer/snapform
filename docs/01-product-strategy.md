# Product strategy, critical review, and V1 scope

**Status:** Proposed decision baseline. **Owner:** Founder/product. **Date:** 27 October 2026.

## 1. Product definition

Snapform is a branded intake and qualification platform for small B2B agencies, coaches, consultants, and small-to-medium startups. It helps a business collect sufficient, accurate context before a sales call, project kickoff, or customer onboarding, then sends that context to an existing system with a visible receipt.

**Customer promise:** “Get a useful brief before the first conversation, and know it reached the right place.”

The core job is not creating a form. It is reducing the work between an interested prospect and an informed next action. AI earns its place when it reduces setup time, clarifies incomplete answers, or reduces staff rework without increasing respondent effort or cost disproportionately.

### Business outcome hierarchy

1. More enquiries become usable records with less staff follow-up.
2. Staff trust the captured budget, timeline, needs, and contact details.
3. Records reach the business's chosen destination, and failures are repairable.
4. A customer repeats the workflow, keeps the subscription, and can justify its cost.

Form counts, generated questions, AI turns, and registrations are supporting signals, not success outcomes.

## 2. Target segments and buying logic

| Segment | Recurring job and buyer | Pain and purchase trigger | V1 template | Qualification risk |
|---|---|---|---|---|
| Small B2B agency | Founder or operations lead qualifies project enquiries | Incomplete briefs, budget mismatch, repeated discovery calls, messy CRM handoff | Project enquiry: service, goals, budget/currency, timing, decision process, attachment | Do not discard a lead because AI inferred a poor fit |
| Consultant | Independent consultant or boutique team runs discovery and onboarding | Manual email questionnaires and missing context before paid work | Discovery brief and engagement onboarding | Separate preliminary preferences from commitments or quotes |
| Coach | Independent coach or small practice screens business/coaching enquiries | Too much back-and-forth before a call; unclear goals and fit | Goals, desired outcomes, availability, optional context | Exclude medical/therapy, diagnostic and highly sensitive intake from launch positioning |
| Small-to-medium startup | Sales, customer success, or founder handles demo/customer onboarding | Unstructured requests reach the wrong person; repeated qualification | Demo request or customer onboarding brief | Do not promise procurement-grade SSO, residency or regulated controls in V1 |

**Initial beachhead:** agency project qualification and consultant discovery. These share budget, scope, timing, and handoff needs and provide a direct way to measure staff time saved. Coaches and startups are explicit target cohorts with templates and interviews from the beginning; they do not each receive a separate product architecture.

**Recruitment assumption:** service teams with 1–10 intake operators and roughly 20–1,000 eligible starts/month are the first discovery pool. This is a testable focus, not a proven segment size. Startup organization headcount may be much larger than the small team using Snapform.

**Disqualify early:** a buyer whose purchase depends on patient records, clinical assessment, employee background checks, high-stakes automated decisions, complex payments/signatures, offline field work, or enterprise procurement. Capture the demand for later assessment rather than imply launch support.

## 3. Critical assessment of the supplied research

The report is unusually useful on form semantics and operational reliability. It correctly distinguishes public evidence, inference, and proposed architecture. Its competitive feedback is explicitly qualitative; it is not market validation.

| Source coverage | Assessment | Development/business consequence |
|---|---|---|
| pp. 1–8: competitive research and complaints | Strong framing; self-selected reviews and vendor claims cannot establish a large addressable gap | Interview buyers about a specific failed workflow and willingness to switch; avoid a “better than Typeform” claim without comparative evidence |
| pp. 9–12: interfaces and public contracts | Good functional reconstruction; not proof of competitor internals | Use original interaction design and validated migration contracts; do not copy proprietary assets or infer backend parity |
| pp. 13–18: schema, versions, compiler, concurrency | Essential foundations, not optional polish | Implement before AI runtime; test upstream edits, hidden answers, stale writers and pinned sessions |
| p. 14: BullMQ and Redis | Credible at scale but unnecessary operating surface for this founder profile | Use Neon transactional outbox + Cloudflare Queues; retain business events/delivery records and reconcile queue publication after commit |
| pp. 19–22: AI authoring, extraction, knowledge | Correct trust model; needs explicit release tolerances and product bounds | Define model budgets, evidence linkage, confirmation, fallback and held-out evals; no autonomous external actions |
| pp. 23–25: durability, privacy, analytics | Strong requirements, but no named owner, concrete load profile or recovery commitment | Define launch SLOs, restore targets, security test boundaries and named runbooks |
| pp. 26–29: proposed wireframes | Explain jobs and important states; not a production design system or tested UX | Add tokens, responsive rules, accessibility, copy, component states and usability testing |
| p. 30: initial feature set | Still wide for one builder: uploads, migration, calculations, multiple layouts, conversation, integrations | Bound each feature; defer calculations, full graph editing, historical migration and multiple native connectors |
| p. 31: cost examples | Useful warning; token rates are explicitly invented | Use measured calls and current account rates; include abandoned sessions, support and shared infrastructure |
| p. 32: 500–700 hours / ~20 weeks | Aggressive for the complete commercial scope and a polished solo implementation | Budget 960–1,200 founder engineering hours including contingency; deliver an earlier controlled pilot |
| p. 33: launch tests | Good corpus floors; zero errors in a corpus is not a production guarantee | Track field/cohort errors, confidence limits, severity, incident response and a rollback decision |

### Material gaps filled by this blueprint

- A defined buyer, first use case, activation event and paid validation standard.
- Explicit V1 inclusion/exclusion, product capacity limits and acceptance criteria.
- First-party design tokens and functional component behavior.
- Vendor eligibility, outage dependencies, data paths and exit strategy.
- Cancellation, failed payment, subscription grace, usage reservation and abuse economics.
- Clear non-functional targets, risk owners and evidence needed before making market claims.
- A sequenced backlog, checkpoints, realistic staffing and gated long-term expansion.

## 4. V1 must-have capabilities

Every item below is required for the planned market V1. Features may ship in controlled pilot increments, but a missing requirement is not silently reclassified as “done.”

| Capability | Bounded V1 deliverable | Why it earns V1 scope |
|---|---|---|
| Identity and workspace | Verified sign-in, recovery, owner/editor/viewer roles, invites, account deletion | Buyers need accountable access; shared passwords destroy trust |
| Form creation | Blank form, four segment templates, duplicate form, stable fields, pages and optional one-question cards | Delivers the intake job without model dependence |
| Fields | Short/long text, email, number, single/multiple choice, date, acknowledgment, file upload; headings/help text | Covers agreed pilot briefs; no widget marketplace |
| Logic | Typed conditions, applicability, forward branching, endings and publish diagnostics | Collect only relevant context and avoid hidden-field failures |
| Safe editing/publication | Autosave states, revision conflicts, undo, preview, publish validation, versions, pause and rollback | Prevents lost authoring work and changing active questionnaires |
| Branding and sharing | Logo, accessible accent, bounded typography, hosted link and inline iframe embed | Professional appearance is a purchase requirement |
| Trusted collection | Server validation, visible save behavior, same-browser recovery, final review, idempotent submit | The primary asset is a durable, correct record |
| AI authoring | Pasted brief/prompt to draft and supported edits; typed diff, apply/discard, compiler and undo | Reduces time to first useful form with human review |
| Guided intake | Optional bounded English conversation, approved pasted FAQs, candidate evidence, review/edit, persistent standard-field fallback | Tests the differentiated interaction without making AI an availability dependency |
| Results | Search/filter/paginated responses, original versus extracted answers, record status, private files, CSV export | Operators must use and trust the output |
| Delivery | Verified internal email notification, signed outbound webhook, delivery history and safe retry | A form without handoff does not finish the customer's job |
| Migration | Authorized Typeform definition import for supported fields/routing, compatibility report and assisted cutover | Reduces switching risk for one defined source; see connector gate below |
| Commercial controls | One trial and one paid team plan initially, usage display/caps, Razorpay checkout, owner billing/available invoices, cancellation, dunning | A market product needs understandable commercial behavior |
| Product operations | Minimal funnel analytics, privacy/deletion, abuse controls, monitoring, backups/restore, support and trust pages | These are part of the sellable product |

**Native destination gate:** V1 includes email and signed webhooks. During discovery, choose at most one native destination only if at least three committed pilots need the same one and webhook/automation setup blocks activation. HubSpot is a candidate, not a predetermined commitment. A native adapter adds a separately estimated 40–80 engineering hours and its own acceptance gate. Do not market it until delivered.

**Migration gate:** Typeform is the default first source, subject to a 2-day feasibility spike with authorized pilot definitions. If pilot demand favors Jotform, substitute the first adapter before implementation and record the decision. Generic “Typeform/Jotform compatibility” is not a V1 claim.

## 5. Explicit exclusions

V1 does not include payments collected by customer forms, legal document signing, bookings, a CRM, marketing automation, voice, WhatsApp, live human takeover, offline mobile clients, matrix/repeater/catalog widgets, arbitrary scripts/CSS, custom respondent domains, real-time coediting, general formulas, multilingual adaptive interviewing, cross-form workflows, AI analytics, automated lead rejection, SSO/SCIM, BYOK, self-hosting, SOC 2 certification or regulated-deployment promises.

Billing customers for the Snapform subscription **is** required. It is a separate scope from collecting payments inside customer forms.

## 6. Core journeys and release milestones

**Creator:** choose a template/import/paste brief → edit fields → set one conditional path → inspect examples → style → preview mobile → publish → submit a test → verify delivery → share with real prospects.

**Respondent:** read purpose/privacy and save notice → use fields or choose guided help → supply relevant answers → correct extracted values → review → explicitly submit → receive durable confirmation. A respondent account is not required.

**Operator:** open notification → inspect original/confirmed data → see delivery receipt → correct an internal note without overwriting respondent evidence → export or retry handoff.

**Owner:** see usage and estimated limits → buy/cancel plan → invite/remove people → configure retention → export/delete data → contact support.

**Private-pilot milestone:** five-field branded project intake, one conditional section, mobile submit, response detail and email/webhook delivery with recovery. AI is unnecessary to prove this first slice.

**Market V1:** complete must-have scope, commercial gate, reliability/security gate, and a controlled demonstration that optional AI helps at least one repeated workflow. If conversation fails evaluation, keep the product in pilot or explicitly rescope and reposition the release with the founder; do not imply the planned hybrid V1 is complete.

## 7. Product validation criteria

Proposed decision gates, not measured traction:

- 12–16 interviews: at least three per segment, including an actual operator and budget holder where distinct. Collect at least eight consented sample briefs.
- Three committed pilots sharing one recurring job before full editor expansion. Seek five paying pilot workspaces before public acquisition spend.
- Activation = published form + one genuine submitted response + verified destination delivery. A preview/test response does not count.
- Of five paying pilots, at least three use the workflow across four consecutive weeks and confirm saved work or improved intake quality. Record denominator and loss reasons.
- Median time to first publish ≤15 minutes for a supported template, excluding time waiting for external account approval; assisted migration ≤60 minutes for the supported subset.
- At least 90% of reviewed pilot submissions are usable without staff correcting material captured fields; sample at least 50 real consented records across the target workflow. This is an initial pilot floor, not the long-term quality ambition.
- Conversation must improve qualified completeness or reduce staff rework directionally, with acceptable completion time and positive contribution. Do not claim statistically established uplift from small pilot counts.
- If customers value only inexpensive static forms, reconsider the wedge before expanding into more AI and integrations.

## 8. Business prioritization rule

Rank requests by observed frequency × commercial consequence × confidence, divided by engineering **and ongoing support** effort. Mark requests as activation blockers, retention blockers, expansion drivers or cosmetic preferences. Evidence from a committed paying workflow outranks generic parity requests. Overrides are documented decisions, not hidden additions to the launch date.
