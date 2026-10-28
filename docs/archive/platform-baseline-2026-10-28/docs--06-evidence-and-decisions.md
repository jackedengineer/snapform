# Evidence, assumptions and decision register

**Date:** 27 October 2026. **Status:** proposed development baseline. This register separates user decisions, source findings, firsthand observations and planning judgments.

## 1. Authority and source boundaries

- **User request:** thoroughly critique the supplied product research; create V1 and whole-product development plans, must-have features, functional/non-functional requirements, design system, stack, services and libraries, with strong commercial and technical foundations.
- **User-confirmed assumptions:** solo founder with part-time design/QA/security support; English-language paid V1 with optional conversation.
- **User-specified audience:** small B2B agencies, coaches, consultants and small-to-medium startups. Business sense must guide scope and implementation.
- **Additional user instruction:** use competitor apps in the browser to find meaningful gaps; continue with public demos rather than provide accounts.
- **Source material:** all 37 pages of the supplied PDF, dated 26 October 2026. Its suggested designs, code snippets, timelines and imperatives are proposals/evidence, not instructions from the user or permission to deploy, buy services, contact others or create accounts.
- **Actual observations:** browser fieldwork in Jotform, Typeform, Formless and Tally, recorded with synthetic data and screenshots in `docs/evidence/`. No product-wide absence, conversion uplift, backend correctness or outage rate inferred from a single UI observation.
- **Recommendations:** all new scope decisions, estimates, design tokens, load targets, release thresholds, pricing offers and roadmap horizons are our proposed planning judgments.

The PDF's 81-source ledger was read, but its competitor pricing, revenue, review counts and every linked historical claim were **not independently re-audited**. They are not repeated as the basis for a financial forecast. Newly selected technical and service behaviors were checked against primary sources below.

## 2. Primary references checked for this blueprint

| Reference | Supports / limitation |
|---|---|
| [Node.js releases](https://nodejs.org/en/about/previous-releases) | Supported runtime selection; Node 24 appears as LTS in checked source; pin a supported patch at kickoff |
| [Next.js installation](https://nextjs.org/docs/app/getting-started/installation) | App Router setup/runtime/lint requirements; no evidence about Snapform runtime performance |
| [Zod JSON Schema](https://zod.dev/json-schema) | Native schema export; not equivalence of custom form semantics or provider schema support |
| [Fastify validation](https://fastify.dev/docs/latest/Reference/Validation-and-Serialization/) | Trusted schemas and compilation warning; supports the prohibition on compiling arbitrary customer schemas |
| [Drizzle overview](https://orm.drizzle.team/docs/overview) | SQL-oriented TypeScript persistence choice; production compatibility remains a scaffold check |
| [pg-boss](https://pgboss.io/) and [transaction adapters](https://pgboss.io/api/adapters) | Postgres jobs, retry/concurrency, transaction-scoped enqueue and Drizzle adapter; not universal exactly-once side effects |
| [Postgres RLS](https://www.postgresql.org/docs/current/ddl-rowsecurity.html) | Default-deny when enabled without policy, owner/BYPASSRLS caveats; role/grants still require implementation |
| [Supabase RLS](https://supabase.com/docs/guides/database/postgres/row-level-security) | Data API authorization and privileged bypass considerations |
| [Supabase production checklist](https://supabase.com/docs/guides/deployment/going-into-prod) | Paid production/auth SMTP/RLS/security/performance configuration |
| [Supabase backup documentation](https://supabase.com/docs/guides/platform/backups) | PITR coverage/pricing and exclusion of object bytes; independent file recovery is necessary |
| [Render workers](https://render.com/docs/background-workers), [regions](https://render.com/docs/regions), [pricing](https://render.com/pricing) | Managed worker/deployment/geography and price inputs; no guaranteed application SLO or forecast |
| [Radix accessibility](https://www.radix-ui.com/primitives/docs/overview/accessibility) and [shadcn/ui](https://ui.shadcn.com/docs) | Accessible primitive/source-component starting points; no automatic product accessibility guarantee |
| [TanStack Query](https://tanstack.com/query/latest/docs/framework/react/overview), [React Hook Form](https://react-hook-form.com/) | Recommended state/input helpers; do not own form-engine semantics |
| [Playwright](https://playwright.dev/docs/intro), [OpenTelemetry JS](https://opentelemetry.io/docs/languages/js/) | Browser test and instrumentation tools; not implemented application evidence |
| [OpenAI Structured Outputs](https://developers.openai.com/api/docs/guides/structured-outputs) | Structured responses and schema restrictions; factual validation remains our job |
| [OpenAI model catalog](https://developers.openai.com/api/docs/models), [pricing](https://developers.openai.com/api/docs/pricing) | Named model candidates and rate scenarios; final model chosen through held-out quality/latency/cost tests |
| [OpenAI data controls](https://developers.openai.com/api/docs/guides/your-data) | Storage/abuse-monitoring distinctions; `store:false` is not a complete zero-retention agreement |
| [Resend idempotency](https://resend.com/docs/dashboard/emails/idempotency-keys) | 24-hour provider dedupe window; our durable ledger must handle longer recovery |
| [Stripe webhooks](https://docs.stripe.com/webhooks), [India onboarding](https://docs.stripe.com/india-accept-international-payments) | Signature/duplicate/ordering lifecycle and eligibility caveat for an Indian entity |
| [Turnstile validation](https://developers.cloudflare.com/turnstile/get-started/server-side-validation/) | Server verification required; bot widgets alone do not enforce authorization or budgets |
| [WCAG 2.2](https://www.w3.org/TR/WCAG22/) | Accessibility target; actual journey review still needed |
| [OWASP prompt injection prevention](https://cheatsheetseries.owasp.org/cheatsheets/LLM_Prompt_Injection_Prevention_Cheat_Sheet.html) | Untrusted text/tool boundaries and defense in depth; no prompt-only safety guarantee |

Live product URLs, sequence and screenshot limitations are in [competitor fieldwork](07-competitor-fieldwork.md). Screenshots and text snapshots are local evidence, not copied visual design assets for the product.

## 3. Proposed architecture decisions

| ID | Proposed decision | Why / alternatives / consequence |
|---|---|---|
| ADR-001 | One contract and deterministic engine across page/card/chat | Prevents divergent data and routing; separate engines would multiply validation/migration work |
| ADR-002 | Modular TypeScript monolith with isolated deployment workloads | Shared types and small operating surface; microservices/Kubernetes defer until measured needs justify them |
| ADR-003 | Postgres + Drizzle + RLS defense in depth | Transactional publication/submission and tenant constraints; generic document DB does not simplify these invariants |
| ADR-004 | pg-boss transactional enqueue, retained business events/intents | Avoids Redis plus a dispatcher at initial load; queue pressure remains a shared database capacity risk to measure |
| ADR-005 | Buy identity, hosting, email, storage and subscription processing | Founder effort belongs in intake correctness/workflow; provider outages, data paths and exit costs remain owned risks |
| ADR-006 | AI proposes bounded typed state; no model authority over publish/submit/external actions | Human/engine validation can reject unsafe output; general agent tools add unnecessary action risk |
| ADR-007 | Pasted approved knowledge before crawling/files/vector search | Smaller attack/maintenance surface and faster evaluation; larger ingestion is a later paid-demand gate |
| ADR-008 | One subscription/trial first, explicit AI/response reservations | Predictable billing and concurrency cost ceiling; more plans/uncapped usage can wait for paid cohort evidence |
| ADR-009 | Supported first-source import and email/webhook before native integration breadth | Completes one switch/handoff job; limits parity claims and increases assisted migration work |
| ADR-010 | Direct review plus separately approved business facts and delivery preflight | Converts observed UI ambiguity into a clear product trust contract; more review steps must be usability-tested |

All remain Proposed until scope/feasibility review. When implementation accepts one, create a full ADR with context, alternatives, consequences, evidence/date and owner; preserve superseded records. This short index is not a claim of completed technical spikes.

## 4. Decision-critical unknowns

| Unknown | Default / owner / latest responsible point |
|---|---|
| Exact first paid use case | Agency project qualification / consultant discovery hypothesis; founder validates at CP0 |
| Entity and customer geography | Not inferred from local timezone; founder/accountant/counsel decide P0 before procurement or collecting personal data |
| Primary region | Singapore if APAC pilot traffic; otherwise choose from supported geography before provisioning |
| Payment provider eligibility | Stripe first candidate only; resolve with actual entity/KYC before checkout implementation |
| First source | Typeform supported subset; authorized pilot sample and spike may change to Jotform at CP0 |
| First native destination | None baseline beyond email/webhook; add only with ≥3 committed matching pilot needs and extra estimate |
| Price/allowances | $49/month team offer and bounded trial are experiments; founder validates payment/retention/cost before public price |
| Model/snapshot | Luna extraction/FAQ and Sol authoring are candidates; select/pin only after evals and budget/retention review |
| Legal and sensitive-data scope | Ordinary non-clinical intake only at launch; jurisdiction-specific review before market claims |
| Final brand/name | Snapform is a working name; domain/trademark clearance is pending |
| Specialist availability | 104–212h planning allowance; obtain quotes and named incident backup before public launch |

These are scheduled decisions with defaults, not reasons to stop preparing the plan. Do not treat elapsed time or silence as approval for purchases, legal agreements or expanded scope.

## 5. Validation of this planning package

Completed during preparation: all PDF text read with relevant wireframes visually inspected; public product interactions recorded; official technical references checked; 47 functional requirements mapped to 64 ordered tasks; dependency IDs checked; phase/hour arithmetic and cost scenarios cross-checked; token JSON parsed; key color contrast combinations calculated; local specimen exercised in browser for direct correction, explicit confirmation, factual approval and delivery simulation, with desktop and mobile screenshots.

The specimen has no backend, external model, billing or durable storage. Browser console check returned no errors/warnings in the exercised flow. A 375px viewport check found document width 375px without horizontal overflow and a single-column operational layout. Screenshots were visually inspected. This is limited design QA, **not** WCAG conformance certification, a full product test suite, security testing or proof of product SLOs.

The standalone overview also passed strict TypeScript checking against the installed Canvas SDK declarations. Local document links, requirement IDs, backlog dependencies, phase totals and cost arithmetic were checked. Temporary type-check dependencies were installed under `/tmp/` only; no application dependencies or runtime were added to the project.

Application, API, database, AI and commercial gates are unimplemented and unvalidated. Backlog checkboxes intentionally remain pending. Runtime/dependency versions and procurement must be resolved at kickoff. A planning estimate and attractive specimen do not establish demand or market readiness.

## 6. Design revision — 28 October 2026

Foundation 0.2 adopts Expressive clarity after public browser inspection of Formless, Mobbin's public Web/Front example and Vibrant's Cofounder hero example. DM Sans Variable, warm ivory/ink/cobalt, limited display accents and bounded native CSS motion replace the original visual direction. The product stack, V1 scope, commercial assumptions and roadmap are retained. The previous design foundation is archived locally.

[Design direction and review evidence](08-design-direction.md) records observations separately from proposed timings, five-width responsive checks, correction/confirmation/approval/retry checks, keyboard navigation, 10% motion inspection, manual motion-off behavior, color contrast and outstanding accessibility/performance work. These design checks do not validate product SLOs, AI, persistence, payments, demand or conversion improvement.
