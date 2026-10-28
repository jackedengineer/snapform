# Business foundation and launch operating model

**Revised platform budget:** 28 October 2026. **Status:** Assumptions to validate, not a revenue forecast or legal/tax opinion. Audience confirmed by user: small B2B agencies, coaches, consultants, and small-to-medium startups. Solo founder with specialist help.

## 1. Business thesis and differentiation

The buyer pays to remove repeated discovery work and receive a trustworthy brief, not to watch AI generate questions. Sell one recurring use case with a clear before/after: “We used to chase budget, timing and scope over three emails; now we review the brief and act.” Measure the outcome before using that wording as a customer claim.

**Category:** intake and qualification software. **Initial offer:** branded project enquiry/discovery flows with reviewed answers and dependable handoff. **Business model:** recurring workspace subscription with bounded included collection/AI; paid assisted migration when scope exceeds the supported subset.

Differentiate through the complete sequence: import/brief → explainable rules → optional conversation → reviewed structured record → delivery evidence. Each feature is copyable. Durable advantages must develop through segment expertise, reliable migration, reusable intake patterns, distribution relationships and customer trust. Do not claim that AI authoring, auto-fill, undo, conditional logic, embeds or integrations are unique.

### Segment offer hypotheses

| Segment | Offer to test | Purchase evidence | Avoid |
|---|---|---|---|
| Agencies | Better project briefs before discovery calls | Paid pilot replacing a real website enquiry flow | Becoming a full agency CRM/project suite |
| Consultants | Discovery/onboarding that feels professional and reduces follow-up | Recurring client process and willingness to pay after assisted setup | One-time questionnaires with no repeat demand |
| Coaches | Clear goals/fit intake for business coaching | Measurable admin savings and adequate volume | Therapy/medical claims, automated judgment of sensitive traits |
| Startups | Qualified demo or customer onboarding record | An operator owns a destination and responds to leads | Competing with enterprise revenue operations from day one |

Interview all segments; concentrate engineering on the cohort with the strongest repeated paid job. A wide target audience does not justify four onboarding engines or four pricing schemes.

## 2. Discovery and validation program

**Weeks 1–2:** 12–16 interviews (≥3/segment), eight consented sample briefs, observe at least four operators processing an enquiry, and record incumbent spend and switching constraints. Founder owns recruitment; no automated unsolicited outreach is part of this blueprint.

Questions: What happened after the last incomplete enquiry? What did the operator chase? What fields actually affect next action? What happens to a form response today? Which integration is a hard blocker? How many eligible starts/submissions last month? What data must not enter AI? Who approves a subscription? What would prevent moving the live link? What do they pay, and what would they pay for an observed improvement?

Request a concrete paid pilot or paid migration commitment; positive feedback alone is weak evidence. Preserve dissent and loss reasons. Avoid leading with “Would you use an AI form builder?”

**Gate A:** three pilots share a workflow that fits the bounded schema, delivery and retention model. **Gate B:** five paying workspaces, with ≥3 using it across four consecutive weeks and a credible outcome. **Gate C:** support and variable costs allow positive contribution. If a gate fails, change positioning/scope before adding capabilities.

## 3. Pricing experiment

Start with **one trial and one team plan**, rather than a confusing matrix. The following numbers are test offers; validate paid behavior, provider costs and customer usage before making them public.

| Offer hypothesis | Scope | Commercial rule |
|---|---|---|
| 14-day trial | 2 live forms, 2 seats, 50 submitted responses, 20 useful AI session starts, 100MB storage | No card initially; verify creator email; strict spend/rate caps; show trial end/retention before publishing |
| Team at **$49/month** | 10 live forms, 3 seats, 1,000 submitted responses/month, 100 useful AI starts/month, 1GB storage | AI sessions also have token/turn/spend limits; branding removal; email/webhook included |
| Assisted migration | Supported subset included for first pilots; later fixed-scope quote | Charge separately when manual effort exceeds a published allowance; do not sell full compatibility |

Test $39/$49/$69 offers sequentially with comparable cohorts and recorded value, without claiming a statistically established optimum. A solo plan at ~$29 is a later experiment if single-person consultant/coach conversion justifies additional product/price complexity. Annual billing is deferred until renewal/refund/retention behavior is reliable; an annual discount is not free growth. Razorpay is the selected provider using the existing account. The USD offers remain pricing hypotheses; choose the actual charge currency and launch-market/method coverage after testing its Subscription configuration. Build owner billing management in Snapform rather than assuming a provider-hosted portal.

**Usage definitions:** a billable submitted response is a unique committed session response; technical retry, preview, import and delivery replay are excluded. AI start is counted once after useful assistance, not on opening chat, provider refusal or technical failure; internal cost still records those calls. Authoring calls use a separately bounded fair-use allowance and ledger. Spam exclusions use documented rules and an appeal path; do not promise perfect bot classification.

Base response slots and AI spend are reserved atomically. At limits, standard collection follows the published reservation/grace policy, AI falls back to fields, and no overage is purchased automatically. Higher-volume customers get an explicit capacity offer after usage/cost review. No “unlimited” plan at launch.

## 4. Economics model and sensitivity

The supplied report's $1/$5 token example is illustrative. Official model pricing currently lists standard input/output rates of $0.10/$0.50 per million tokens for GPT-6 Luna, $1/$5 for GPT-6.1 Terra and $2/$10 for GPT-6.1 Sol. Confirm selected model/tier/account rates at launch; cached, reasoning, tool, media and other billable units can change actual costs. [OpenAI pricing](https://developers.openai.com/api/docs/pricing).

For 25,000 input + 2,000 output tokens per started session, with 30% additional token work:

| Candidate rate scenario | Estimated model cost/start | 100 starts | 1,000 starts |
|---|---:|---:|---:|
| Luna standard | $0.00455 | $0.455 | $4.55 |
| Terra standard | $0.04550 | $4.55 | $45.50 |
| Sol standard | $0.09100 | $9.10 | $91.00 |

This arithmetic does not establish any model's suitability. Use the actual provider ledger, including abandoned starts, repair/retry/reasoning work and authoring, divided by usable delivered records. The monetary cap may stop a session earlier than token/turn limits. Quality failures, staff correction time and support can outweigh token savings.

**Illustrative $49 account at 100 AI starts/month:** payment cost $2 (a sensitivity assumption, not a Razorpay quote), non-AI variable infrastructure/email/storage $2, and support labor 15 minutes at a planning $25/hour = $6.25. Net revenue here ignores taxes/discounts/refunds for simplicity and must be adjusted in operating reports.

| Scenario | Variable costs including support | Contribution before shared fixed infrastructure | Margin |
|---|---:|---:|---:|
| Luna example | $10.705 | $38.295 | 78.2% |
| Terra example | $14.80 | $34.20 | 69.8% |
| Sol example | $19.35 | $29.65 | 60.5% |
| Sol + 60 minutes support | $38.10 | $10.90 | 22.2% |

These are planning inputs, not provider quotes or accounting classifications. Track software gross margin, support-inclusive contribution and cash burn separately. At $400/month shared fixed platform cost, approximate break-even before founder salary and acquisition is 11/12/14 accounts for the first three scenarios. At 20 Luna-like accounts, shared fixed allocation is $20/account and contribution after allocation is only $18.295/account. Early scale matters even with cheap inference.

Target ≥75% support-inclusive contribution before shared fixed costs as a long-term planning goal, with an initial ≥60% pilot floor and an improvement plan. Measure p50/p95 customer costs and high-usage tails. The offer must be capped/repriced or the model/flow improved when those targets fail; do not compromise extraction correctness to hit margin.

**Acquisition ceiling:** with ~$30 monthly contribution, a $150 CAC implies ~5 months simple payback before churn/time value. This is an illustration, not an approved ad budget. Do not quote lifetime value from short pilot retention. Track cohort retention before buying scale.

## 5. Operating budget and resourcing

Revised planning bands in USD/month before taxes, for low-volume paid operation. **These are internal allowances, not provider price quotes or a claim that Cloudflare is cheaper.** Warm container capacity, scanner use, Neon restore history, queue operations and telemetry drive actual spend. Obtain configuration-based costs during the deployment spike.

| Cost line | Pilot / market V1 allowance | Driver |
|---|---:|---|
| Cloudflare Workers/Containers/Queues | $40–200 | SSR/API traffic, memory and active CPU, API CPU/requests, native scanner and queue operations |
| Neon Postgres compute/storage/restore history | $40–200 | Compute hours, concurrency, branches, database bytes and required recovery retention |
| R2 objects and protected recovery copies | $10–80 | Object volume/operations, exports, scan/copy traffic and retention; separate-account Cloudflare copies and retention |
| Email/monitoring/status/support tooling | $20–100 | Volume, retention, seats and alerts |
| AI development/evaluation/pilot calls | $20–150 | Repeated evals, chosen models and bounded abuse |
| **Component sum** | **$130–730/month** | Arithmetic sum, before taxes and transaction fees |
| **Rounded planning envelope** | **$150–750/month** | Working allocation; not an approved purchasing budget |

Earlier Supabase/Render cost assumptions are superseded. Use the official [Cloudflare Containers](https://developers.cloudflare.com/containers/platform/pricing/), [Workers](https://developers.cloudflare.com/workers/platform/pricing/), [R2](https://developers.cloudflare.com/r2/pricing/) and [Neon](https://neon.com/pricing) pricing for the actual configured deployment. Choose paid restore settings and test database/file recovery independently. Hosting an auth library moves its operation into compute/support effort rather than eliminating it. Razorpay transaction charges, taxes, refunds, disputes, international/currency terms and isolated native scanner capacity are separate inputs; use the actual account agreement/tested product configuration before final margin claims.

V1 founder engineering: previous envelope 960–1,200 focused hours including contingency, now provisional pending the TanStack/Cloudflare/auth/outbox feasibility re-baseline. Specialist allowances: product/UI design 40–80h; QA/accessibility 40–80h; application security 16–32h; jurisdiction-specific legal/accounting 8–20h. Total specialist 104–212h. At a purely illustrative blended $50/hour, this is $5,200–10,600 plus infrastructure; get actual specialist quotes. Founder opportunity cost and sales/support time are separate. Reserve another 5–10h/week for discovery, sales, support and administration; do not count those as the 30 focused engineering hours.

If cash cannot cover recovery, security review and support, run a narrower controlled pilot and postpone market launch. Hiring another engineer helps throughput but does not remove customer discovery, provider onboarding or observation periods.

## 6. Go-to-market sequence

1. **Founder-led pilots:** manually recruit within agency, consultant, coaching and startup networks; consented workflow observation; hands-on supported migration. Business goal: prove activation and paid repeat usage.
2. **Use-case content:** publish original templates, before/after intake examples and clear setup guides. Segment landing pages should explain a workflow rather than claim generic AI superiority.
3. **Partner channel:** after successful pilots, test website builders, consultants and small agency communities as referral partners. Require authorized sharing, clear economics and accurate product claims.
4. **Self-serve onboarding:** template → first publish → test delivery → first real response, with contextual help. Improve the largest activation drop-off before increasing traffic.
5. **Controlled paid distribution:** only after retained cohorts, cost control, support capacity and measurable funnel conversion. Avoid broad “form builder” bidding against mature free tools initially.

No external outreach was executed in preparing this plan. Any future messaging campaign needs explicit authorization and an appropriate recipient/purpose list.

## 7. Metrics and review cadence

North-star outcome: **usable records delivered to the intended destination without material staff repair**, per active customer week. Define usable/qualified rules per workflow and record their version.

Weekly founder review: interview→pilot conversion; activation fraction/time; first genuine delivery; weekly active paid workspaces; eligible starts→usable submitted→delivered; staff material correction rate; completion time; delivery failures/recovery; support minutes/customer; AI cost/start and usable record; cash burn.

Monthly review: paid conversion, MRR net of discounts, logo/revenue retention, cancellations and reasons, cohort contribution, acquisition/payback where sufficient data exists, chargebacks/refunds, incident/recovery evidence. Never blend free trials, test responses and paid production usage into a single attractive total.

AI comparison: same questionnaire and comparable traffic in standard/guided modes, with correction/time/cost and device cohorts. Optional self-selection introduces bias; use random assignment among consenting eligible sessions if making a causal claim. Small samples justify directional product learning, not published conversion multipliers.

## 8. Non-technical foundations and owners

| Foundation | Owner / evidence before launch |
|---|---|
| Entity, banking, payment access, invoices/taxes | Founder + accountant: approved merchant account and real invoice/refund workflow |
| Product name/domain/trademark | Founder + counsel where needed: clearance; Snapform is a working name, not cleared branding |
| IP and licenses | Founder: contractor IP assignment, OSS/font inventory, original assets, no implied competitor affiliation |
| Terms/privacy/DPA/subprocessors | Counsel + founder: documents match actual collection, AI, deletion, support and vendor data paths |
| Marketing consent/cookies | Founder + counsel: actual launch markets, purpose and consent controls; optional AI separate from marketing permission |
| Sensitive-data boundaries | Founder/product: acceptable-use policy and honest exclusions, with enforcement/help content |
| Trial/cancellation/refund/dunning | Founder: customer-visible terms and tested billing lifecycle |
| Trust center/status/support | Founder: accurate security summary, support hours, incident channel, current subprocessors and system status |
| Customer onboarding/migration | Founder: supported feature matrix, cutover checklist, return-to-incumbent option and measurable first value |
| Security/incident ownership | Founder + named backup specialist: rotation, breach assessment/escalation process, tabletop and restore evidence |

Do not paste generic legal policies into the product. Decide selling entity and initial customer geographies during P0, then get appropriate advice and vendor agreements. No compliance badge or “HIPAA/GDPR compliant” marketing claim follows automatically from encryption or a cloud provider's certification.

## 9. Commercial and technical release gates

Market launch requires all P0 functional requirements, measured technical gates, resolved critical/high review findings, restore evidence, accurate help/limits/pricing, merchant access, and named support/on-call coverage. Five paying pilot workspaces and repeated usage are the proposed commercial threshold. Founder makes a documented go/no-go decision; stage from invited pilots to a waitlist cohort, then public access.

Support promise at launch: published business hours and a next-business-day normal support target; urgent collection failure alerts require an actual named responder and backup. Do not sell a 24/7 contractual SLA with solo staffing. Incident workflow: detect → acknowledge/triage → protect collection/disable affected feature → communicate accurate impact → recover/reconcile → post-incident review and action owner.

Roll back deployment or pause onboarding for acknowledged-data loss, tenant isolation failure, uncontrolled spend, billing corruption or unrecoverable collection failure. Disable AI independently for extraction/grounding failure. Stop new starts on compromised forms when needed; preserve durable evidence and existing data under incident policy.

## 10. Expansion discipline

Expand a feature only if it solves an observed paid activation/retention problem, a sustainable price supports it, the core reliability budget is healthy, and a named owner can support it. A coach request for booking and a startup request for CRM automation are separate business cases. Build one adjacent workflow at a time; the long-term roadmap is an option set, not a promise to match three mature vendors.
