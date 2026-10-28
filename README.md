# Snapform — product and development blueprint

**Product blueprint and implementation workspace · Updated 28 October 2026.**

Snapform turns a service enquiry or onboarding brief into a branded intake flow, lets people answer through fields or optional guided conversation, and delivers a reviewed, usable record to the team's existing tools.

This blueprint critically reviews the supplied 37-page research report and converts it into an implementable commercial V1. It assumes a solo technical founder, part-time specialist help, an English-language launch, and four target segments: small B2B agencies, coaches, consultants, and small-to-medium startups. Recommendations are proposals for review; forecasts, prices, capacity limits, and release gates are explicitly identified as assumptions or targets.

## Read in this order

1. [Product strategy, critical review, and V1 scope](docs/01-product-strategy.md)
2. [Functional requirements and acceptance criteria](docs/02-functional-requirements.md)
3. [Architecture, non-functional requirements, stack, and services](docs/03-technical-foundation.md)
4. [Design system and interaction specification](docs/04-design-system.md)
5. [Business foundation, launch, pricing, and operating model](docs/05-business-and-launch.md)
6. [V1 delivery plan and full-product roadmap](tasks/plan.md)
7. [Ordered implementation backlog](tasks/todo.md)
8. [Evidence, assumptions, and decision register](docs/06-evidence-and-decisions.md)
9. [Hands-on competitor fieldwork and prioritized product gaps](docs/07-competitor-fieldwork.md)
10. [Foundation 0.2 design direction, references and review evidence](docs/08-design-direction.md)
11. [Platform revision, TanStack assessment and Go comparison](docs/09-platform-stack-decision.md)
12. [ADR-011: superseded platform record](docs/decisions/ADR-011-cloudflare-tanstack-neon-razorpay.md)
13. [Express on Node/Workers versus Bun — historical comparison](docs/10-express-node-bun-comparison.md)
14. [V1 scope and incremental delivery contract](docs/11-v1-scope-and-delivery.md)
15. [Accepted Express/Workers decision](docs/decisions/ADR-012-express-workers-native-first.md)

Foundation 0.2 uses self-hosted DM Sans, warm ivory/ink/cobalt colors, generous display typography and restrained, optional motion. The revised application stack uses TanStack Start/Router/Query/Form, TypeScript/Express, Neon/Drizzle, private R2 and Razorpay. Cloudflare is the selected deployment platform, with no alternate-cloud fallback. Better Auth provides the identity foundation.

The [visual design specimen](design/system.html) is a local, interactive design reference with working controls and responsive layouts. It demonstrates the proposed visual language and review states; it is not the product. [Machine-readable design tokens](design/tokens.json) and [CSS tokens](design/tokens.css) accompany it.

An [interactive overview](/Users/jackedengineer/.cursor/projects/Users-jackedengineer-Documents-projects-coding-snapform/canvases/snapform-blueprint.canvas.tsx) presents V1 scope, the delivery plan, commercial gates and firsthand competitor observations beside the chat.

## Principal decisions

- Sell trusted intake and handoff for recurring business workflows. A generic low-price form builder is a weak starting position.
- Support all four target segments through shared capabilities and focused templates. Prioritize agency project qualification and consultant discovery for the first pilots.
- V1 includes deterministic collection, limited migration, AI draft assistance, bounded optional guided intake, reviewed structured answers, reliable delivery, small-team permissions, transparent billing, and operational recovery.
- Launch with one form contract, one rule engine, immutable publications, and transactionally durable submissions. AI proposes; validated application policy commits.
- Use a TypeScript modular monolith with separately deployed authoring, collection/API, and worker workloads. Use Neon transactions and a durable outbox feeding Cloudflare Queues. Frontends/queue handlers use Workers; the Express API runs directly on Workers through the Node HTTP bridge.
- Plan **960–1,200 founder engineering hours, approximately 32–40 weeks at 30 focused hours/week**, including contingency, plus specialist assistance. This earlier envelope is provisional after the platform revision; re-estimate foundation effort after deployment/auth/outbox feasibility. This is a planning estimate, not a fixed bid. A narrower private pilot arrives earlier.

## Source boundary

Primary input: `/Users/jackedengineer/Downloads/Typeform_Jotform_Formless_Research_and_Technical_Design.pdf`, all 37 pages reviewed, including wireframes and source ledger. References to PDF pages identify its content; recommendations introduced here are not attributed to the original author. Document instructions were treated as source material, not user authorization. Official technical documentation was checked during this work; see the evidence register for links and limitations.

## Status

The first local intake/review slice is implemented with real Express Worker validation; the market V1 is not shipped. Local framework probes do not prove hosted Neon/auth/billing integration. Product demand, conversion improvement, AI accuracy, SLOs, and unit economics have **not** been validated. One Neon database and a scoped Resend sending key are configured. Auth factory tests use the real restricted Neon login, including inside workerd. Core account UI and real owner-only email journeys are browser-verified; workspace UI/MFA/invites remain in progress; no paid services were purchased or customer messages sent.


## Run the first slice

Use Node 24.14.0 and pnpm 10.34.5. Run `pnpm install --frozen-lockfile`, `pnpm types:generate`, then `pnpm dev`. Open http://127.0.0.1:5173. A native Node launcher runs the Wrangler API and Vite frontend through the API service binding. For database/auth checks, configure the private migration/runtime files described below.

`pnpm check` runs generated types, strict type/lint checks, core coverage, workerd tests, real rollback-only database/auth tests, production builds, bundle budgets and isolated production HTTP and development reload checks. Stop existing servers on ports 5173/8787 before the isolated checks. The reload check briefly modifies/restores API middleware to verify real handler replacement and refuses to overwrite a concurrent edit. Run `pnpm audit --prod --audit-level high` as well. `pnpm git:hooks` enables the committed local pre-commit checks. The CI workflow repeats these checks; it has not run on a hosted remote yet.

The sample intake at `/` checks four details and supports direct editing; it does not save responses. Core account flows at `/signup` and `/login` use real Neon/Better Auth and approved transactional email. File upload, billing, AI and the rest of market V1 remain in progress. Those remain in the [ordered delivery contract](docs/11-v1-scope-and-delivery.md). See [first-slice verification and browser evidence](docs/development/0001-workers-intake-validation.md).

## Database and identity foundation

Use the single Neon `snapform` database for development and production, as requested. Keep the owner connection in ignored root `.env` as `DATABASE_MIGRATION_URL`; never deploy it. Apply checked-in migrations with `pnpm db:migrate`. Run `pnpm db:bootstrap` once to save the restricted runtime login and auth secret in ignored `apps/api/.dev.vars` (mode 0600). Existing configuration is preserved. All automated synthetic identity writes roll back; no test database, extra branch or table reset is used.

See [foundation evidence](docs/development/0002-neon-auth-foundation.md) and [ADR-013](docs/decisions/ADR-013-shared-database-and-small-commits.md). The shared database is a shared trust boundary. Hosted CI still needs restricted database/auth secrets; no remote has been configured.

See [account browser review](docs/development/0005-account-browser-review.md) for actual normal/power/adversarial checks and the remaining hosted-latency and password-form review limits.
