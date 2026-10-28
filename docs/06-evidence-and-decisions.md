# Evidence, assumptions and decision register

**Original date:** 27 October 2026. **Platform revision:** 28 October 2026. **Status:** user-selected provider/framework direction with implementation recommendations and gates. This register separates user decisions, source findings, firsthand observations and planning judgments.

## 1. Authority and source boundaries

- **User request:** thoroughly critique the supplied product research; create V1 and whole-product development plans, must-have features, functional/non-functional requirements, design system, stack, services and libraries, with strong commercial and technical foundations.
- **User-confirmed assumptions:** solo founder with part-time design/QA/security support; English-language paid V1 with optional conversation.
- **User-specified audience:** small B2B agencies, coaches, consultants and small-to-medium startups. Business sense must guide scope and implementation.
- **Additional user instruction:** use competitor apps in the browser to find meaningful gaps; continue with public demos rather than provide accounts.
- **Current user platform decisions, 28 October:** TanStack frontends, TypeScript/Express on Cloudflare Workers, no alternate-cloud fallback, Razorpay using the existing account, no Supabase, Neon/Drizzle and private R2. Native APIs, lightweight dependencies, performance, tests and three-mode browser verification are explicit priorities.
- **Source material:** all 37 pages of the supplied PDF, dated 26 October 2026. Its suggested designs, code snippets, timelines and imperatives are proposals/evidence, not instructions from the user or permission to deploy, buy services, contact others or create accounts.
- **Actual observations:** browser fieldwork in Jotform, Typeform, Formless and Tally, recorded with synthetic data and screenshots in `docs/evidence/`. No product-wide absence, conversion uplift, backend correctness or outage rate inferred from a single UI observation.
- **Recommendations:** all new scope decisions, estimates, design tokens, load targets, release thresholds, pricing offers and roadmap horizons are our proposed planning judgments.

The PDF's 81-source ledger was read, but its competitor pricing, revenue, review counts and every linked historical claim were **not independently re-audited**. They are not repeated as the basis for a financial forecast. Newly selected technical and service behaviors were checked against primary sources below. Older provider/framework recommendations are superseded by ADR-011; archived snapshots retain their original rationale.

## 2. Primary references checked for this blueprint

| Reference | Supports / limitation |
|---|---|
| [Node.js releases](https://nodejs.org/en/about/previous-releases) | Supported runtime selection; Node 24 appears as LTS in checked source; pin a supported patch at kickoff |
| [Zod JSON Schema](https://zod.dev/json-schema) | Native schema export; not equivalence of custom form semantics or provider schema support |
| [Fastify validation](https://fastify.dev/docs/latest/Reference/Validation-and-Serialization/) | Trusted schemas and compilation warning; supports the prohibition on compiling arbitrary customer schemas |
| [Drizzle overview](https://orm.drizzle.team/docs/overview) | SQL-oriented TypeScript persistence choice; production compatibility remains a scaffold check |
| [Postgres RLS](https://www.postgresql.org/docs/current/ddl-rowsecurity.html) | Default-deny when enabled without policy, owner/BYPASSRLS caveats; role/grants still require implementation |
| [Radix accessibility](https://www.radix-ui.com/primitives/docs/overview/accessibility) and [shadcn/ui](https://ui.shadcn.com/docs) | Accessible primitive/source-component starting points; no automatic product accessibility guarantee |
| [TanStack catalog](https://tanstack.com/libraries), [Start on Cloudflare](https://developers.cloudflare.com/workers/framework-guides/web-apps/tanstack-start/), [Form](https://tanstack.com/form/latest/docs/overview), [DB](https://tanstack.com/db/latest/docs/overview) | Current frontend responsibilities/maturity; headless helpers do not replace domain validation or Neon |
| [Playwright](https://playwright.dev/docs/intro), [OpenTelemetry JS](https://opentelemetry.io/docs/languages/js/) | Browser test and instrumentation tools; not implemented application evidence |
| [OpenAI Structured Outputs](https://developers.openai.com/api/docs/guides/structured-outputs) | Structured responses and schema restrictions; factual validation remains our job |
| [OpenAI model catalog](https://developers.openai.com/api/docs/models), [pricing](https://developers.openai.com/api/docs/pricing) | Named model candidates and rate scenarios; final model chosen through held-out quality/latency/cost tests |
| [OpenAI data controls](https://developers.openai.com/api/docs/guides/your-data) | Storage/abuse-monitoring distinctions; `store:false` is not a complete zero-retention agreement |
| [Resend idempotency](https://resend.com/docs/dashboard/emails/idempotency-keys) | 24-hour provider dedupe window; our durable ledger must handle longer recovery |
| [Turnstile validation](https://developers.cloudflare.com/turnstile/get-started/server-side-validation/) | Server verification required; bot widgets alone do not enforce authorization or budgets |
| [Cloudflare HTTP bridge](https://developers.cloudflare.com/workers/runtime-apis/nodejs/http/), [web standards](https://developers.cloudflare.com/workers/runtime-apis/web-standards/) | Node HTTP compatibility does not remove dynamic-code restrictions; local Fastify router/compiler failure recorded separately |
| [Cloudflare Containers](https://developers.cloudflare.com/containers/get-started/), [routing](https://developers.cloudflare.com/containers/configuration/scaling-and-routing/) | Full-runtime container deployment and instance lifecycle; not a measured Snapform deployment or automatic replica policy |
| [Neon/Workers](https://developers.cloudflare.com/workers/databases/third-party-integrations/neon/), [Drizzle/Hyperdrive](https://developers.cloudflare.com/hyperdrive/examples/connect-to-postgres/postgres-drivers-and-libraries/drizzle-orm/), [caching](https://developers.cloudflare.com/hyperdrive/concepts/how-hyperdrive-works/) | Database transport choices and cache consistency; interactive transactions and tenant isolation still require real tests |
| [Better Auth Express](https://better-auth.com/docs/integrations/express), [Drizzle](https://better-auth.com/docs/adapters/drizzle) | Proposed auth integration; no claim of completed MFA/cookie/session/security tests |
| [Cloudflare Queues](https://developers.cloudflare.com/queues/reference/delivery-guarantees/), [limits](https://developers.cloudflare.com/queues/platform/limits/) | At least once delivery and bounded transport; requires transactional outbox and application dedupe |
| [R2 signing](https://developers.cloudflare.com/r2/api/s3/presigned-urls/), [locks](https://developers.cloudflare.com/r2/buckets/bucket-locks/), [Neon backups](https://neon.com/docs/postgres/backup-restore/backups) | Private object capabilities/retention and database recovery; database backup does not copy object content |
| [Razorpay Subscriptions](https://razorpay.com/docs/payments/subscriptions/), [integration](https://razorpay.com/docs/payments/subscriptions/integration-guide/), [webhooks](https://razorpay.com/docs/webhooks/validate-test/) | Selected billing flow, raw-body signatures, duplicates and ordering; existing account features/currency still need test-mode verification |
| [TanStack AI OpenAI adapter](https://tanstack.com/ai/latest/docs/adapters/openai) | Selected typed provider/stream interface; required usage/storage/refusal controls must pass adapter tests |
| [Go concurrency](https://go.dev/doc/effective_go#concurrency), [Node event loop](https://nodejs.org/en/learn/asynchronous-work/dont-block-the-event-loop), [Workers execution](https://developers.cloudflare.com/workers/reference/how-workers-works/) | Concurrency/parallelism/runtime distinction; no Snapform Go benchmark or automatic speedup evidence |
| [WCAG 2.2](https://www.w3.org/TR/WCAG22/) | Accessibility target; actual journey review still needed |
| [OWASP prompt injection prevention](https://cheatsheetseries.owasp.org/cheatsheets/LLM_Prompt_Injection_Prevention_Cheat_Sheet.html) | Untrusted text/tool boundaries and defense in depth; no prompt-only safety guarantee |

Live product URLs, sequence and screenshot limitations are in [competitor fieldwork](07-competitor-fieldwork.md). Screenshots and text snapshots are local evidence, not copied visual design assets for the product.

## 3. Proposed architecture decisions

| ID | Proposed decision | Why / alternatives / consequence |
|---|---|---|
| ADR-001 | One contract and deterministic engine across page/card/chat | Prevents divergent data and routing; separate engines would multiply validation/migration work |
| ADR-002 | Modular TypeScript monolith with isolated deployment workloads | Shared types and small operating surface; microservices/Kubernetes defer until measured needs justify them |
| ADR-003 | Postgres + Drizzle + RLS defense in depth | Transactional publication/submission and tenant constraints; generic document DB does not simplify these invariants |
| ADR-004 — superseded by ADR-011 | Earlier proposal: pg-boss transactional enqueue | Replaced by Neon outbox + Cloudflare Queues; old proposal retained for history |
| ADR-005 — provider choices superseded by ADR-011 | Earlier proposal: buy identity/hosting/storage/billing services | Current baseline uses Better Auth operation, Cloudflare, Neon and Razorpay; email still Resend |
| ADR-006 | AI proposes bounded typed state; no model authority over publish/submit/external actions | Human/engine validation can reject unsafe output; general agent tools add unnecessary action risk |
| ADR-007 | Pasted approved knowledge before crawling/files/vector search | Smaller attack/maintenance surface and faster evaluation; larger ingestion is a later paid-demand gate |
| ADR-008 | One subscription/trial first, explicit AI/response reservations | Predictable billing and concurrency cost ceiling; more plans/uncapped usage can wait for paid cohort evidence |
| ADR-009 | Supported first-source import and email/webhook before native integration breadth | Completes one switch/handoff job; limits parity claims and increases assisted migration work |
| ADR-010 | Direct review plus separately approved business facts and delivery preflight | Converts observed UI ambiguity into a clear product trust contract; more review steps must be usability-tested |
| [ADR-011](decisions/ADR-011-cloudflare-tanstack-neon-razorpay.md) | User-selected TanStack / Cloudflare / Neon / R2 / Razorpay; retain Express Worker runtime | Accepted provider/framework direction; auth/runtime/queue integration gates recorded |

ADR-001–010 remain Proposed unless annotated superseded; ADR-011 accepts the user-selected provider/framework direction, with implementation details gated by feasibility. When implementation accepts one, create a full ADR with context, alternatives, consequences, evidence/date and owner; preserve superseded records. This short index is not a claim of completed technical spikes.

## 4. Decision-critical unknowns

| Unknown | Default / owner / latest responsible point |
|---|---|
| Exact first paid use case | Agency project qualification / consultant discovery hypothesis; founder validates at CP0 |
| Entity and customer geography | Not inferred from local timezone; founder/accountant/counsel decide P0 before procurement or collecting personal data |
| Primary region | Choose Neon region near pilot traffic; verify actual Cloudflare container/Worker-to-database placement and latency before commitment |
| Payment integration | Razorpay selected and account already exists; confirm Subscription configuration, currency/method/customer coverage and lifecycle in test mode at T03 |
| First source | Typeform supported subset; authorized pilot sample and spike may change to Jotform at CP0 |
| First native destination | None baseline beyond email/webhook; add only with ≥3 committed matching pilot needs and extra estimate |
| Price/allowances | $49/month team offer and bounded trial are experiments; founder validates payment/retention/cost before public price |
| Model/snapshot | Luna extraction/FAQ and Sol authoring are candidates; select/pin only after evals and budget/retention review |
| Legal and sensitive-data scope | Ordinary non-clinical intake only at launch; jurisdiction-specific review before market claims |
| Final brand/name | Snapform is a working name; domain/trademark clearance is pending |
| Specialist availability | 104–212h planning allowance; obtain quotes and named incident backup before public launch |

These are scheduled decisions with defaults, not reasons to stop preparing the plan. Do not treat elapsed time or silence as approval for purchases, legal agreements or expanded scope.

## 5. Validation of this planning package

Completed during original 27 October preparation: all PDF text read with relevant wireframes visually inspected; public product interactions recorded; official technical references checked; 47 functional requirements mapped to 64 ordered tasks; dependency IDs checked; phase/hour arithmetic and cost scenarios cross-checked; token JSON parsed; key color contrast combinations calculated; local specimen exercised in browser for direct correction, explicit confirmation, factual approval and delivery simulation, with desktop and mobile screenshots.

The specimen has no backend, external model, billing or durable storage. Browser console check returned no errors/warnings in the exercised flow. A 375px viewport check found document width 375px without horizontal overflow and a single-column operational layout. Screenshots were visually inspected. This is limited design QA, **not** WCAG conformance certification, a full product test suite, security testing or proof of product SLOs.

The standalone overview also passed strict TypeScript checking against the installed Canvas SDK declarations. Local document links, requirement IDs, backlog dependencies, phase totals and cost arithmetic were checked. Temporary type-check dependencies were installed under `/tmp/` only; no application dependencies or runtime were added to the project.

Application, API, database, AI and commercial gates are unimplemented and unvalidated. Backlog checkboxes intentionally remain pending. Runtime/dependency versions and procurement must be resolved at kickoff. A planning estimate and attractive specimen do not establish demand or market readiness.

## 6. Design revision — 28 October 2026

Foundation 0.2 adopts Expressive clarity after public browser inspection of Formless, Mobbin's public Web/Front example and Vibrant's Cofounder hero example. DM Sans Variable, warm ivory/ink/cobalt, limited display accents and bounded native CSS motion replace the original visual direction. The product stack, V1 scope, commercial assumptions and roadmap are retained. The previous design foundation is archived locally.

[Design direction and review evidence](08-design-direction.md) records observations separately from proposed timings, five-width responsive checks, correction/confirmation/approval/retry checks, keyboard navigation, 10% motion inspection, manual motion-off behavior, color contrast and outstanding accessibility/performance work. These design checks do not validate product SLOs, AI, persistence, payments, demand or conversion improvement.

## 7. Platform revision — 28 October 2026

[ADR-011](decisions/ADR-011-cloudflare-tanstack-neon-razorpay.md) records the user-directed TanStack/Cloudflare/Neon/R2/Razorpay changes, retained TypeScript/Fastify recommendation at that stage and removal of the previous provider choices. [Detailed assessment](09-platform-stack-decision.md) separates the TanStack catalog, maturity and adoption decisions from runtime requirements. Better Auth is an added recommended integration baseline, not a provider the user explicitly named.

A temporary local compatibility spike tested Fastify 5.12.7, Wrangler 4.154.0 and workerd 1.20261023.1: the direct Worker route failed dynamic generation restrictions; the ordinary Node control passed health, multiple cookies and valid/invalid schema cases. [Evidence](evidence/fastify-cloudflare-compat/worker-result.txt) includes source/configuration, versions and Node results. No provider credentials, cloud deployment, live payment or production performance test was used. That probe motivated the previous Containers recommendation; ADR-012 supersedes that API path. It does not prove cloud operations.

The active backlog now has 66 pending tasks, adding T65 for deployed runtime/Neon/auth proof and T66 for outbox/Queues recovery. FR-37 specifies Razorpay checkout and Snapform-owned billing management. The old schedule remains provisional pending foundation re-estimation. Operating allowances are revised to $150–750/month, explicitly internal bands rather than provider quotes. The previous baseline is archived under `docs/archive/platform-baseline-2026-10-28/`.

Revision verification: active local document links passed; all 66 task IDs are unique/pending, dependency references exist and the graph is acyclic; FR-01–47 remain mapped. Budget component bands sum to $130–730 before the rounded $150–750 allocation. The updated interactive overview passed strict TypeScript checking against the local Canvas SDK declarations. These checks validate the planning package, not unimplemented product behavior.

## 8. Express/Node/Bun comparison — 28 October 2026

The user asked how Node/Express and Bun/Express differ from Fastify; this is not authorization to replace the selected backend. [Comparison](10-express-node-bun-comparison.md) uses official Express, Fastify, Bun and Cloudflare documentation. A local Express 5.3.0/workerd probe passed nine asserted compatibility cases, including Zod checks, multiple cookies, synthetic raw-body HMAC, sanitized async error and SSE framing. No database/provider/production integration, streaming performance or Bun runtime test was performed. The comparison originally recommended evaluating Express on Workers. It is historical; the user subsequently selected Express/Workers in ADR-012.

## 9. Implementation authorization and standards

The user selected Express/Workers, excluded alternate-cloud deployment, authorized clean local Git and incremental implementation, and required tests plus normal/power/adversarial browser checks. ADR-012, AGENTS.md, CONSTRAINTS.md, CONTRIBUTING.md and the V1 delivery contract record that authority. Previous comparisons and ADR-011 are superseded historical evidence. No hosted deployment or live payment is claimed.

## 10. First application slice

The local TanStack Start/Express Worker intake validates and reviews a bounded brief without saving it. [Verification](development/0001-workers-intake-validation.md) records automated and actual browser evidence, discovered bridge/CSP issues, fixes, bundle budgets and remaining hosted integration gates. Earlier sections describe their dated research state, not current implementation status.
