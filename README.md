# Snapform — product and development blueprint

**Planning draft · 27 October 2026 · Design and platform revision 28 October 2026 · No application has been implemented.**

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
12. [ADR-011: Cloudflare, TanStack, Neon and Razorpay](docs/decisions/ADR-011-cloudflare-tanstack-neon-razorpay.md)
13. [Express on Node/Workers versus Bun — comparison and local evidence](docs/10-express-node-bun-comparison.md)

Foundation 0.2 uses self-hosted DM Sans, warm ivory/ink/cobalt colors, generous display typography and restrained, optional motion. The revised application stack uses TanStack Start/Router/Query/Form, TypeScript/Fastify, Neon/Drizzle, private R2 and Razorpay. Cloudflare is the preferred platform; AWS is the workload fallback. Better Auth is the proposed identity replacement.

The [visual design specimen](design/system.html) is a local, interactive design reference with working controls and responsive layouts. It demonstrates the proposed visual language and review states; it is not the product. [Machine-readable design tokens](design/tokens.json) and [CSS tokens](design/tokens.css) accompany it.

An [interactive overview](/Users/jackedengineer/.cursor/projects/Users-jackedengineer-Documents-projects-coding-snapform/canvases/snapform-blueprint.canvas.tsx) presents V1 scope, the delivery plan, commercial gates and firsthand competitor observations beside the chat.

## Principal decisions

- Sell trusted intake and handoff for recurring business workflows. A generic low-price form builder is a weak starting position.
- Support all four target segments through shared capabilities and focused templates. Prioritize agency project qualification and consultant discovery for the first pilots.
- V1 includes deterministic collection, limited migration, AI draft assistance, bounded optional guided intake, reviewed structured answers, reliable delivery, small-team permissions, transparent billing, and operational recovery.
- Launch with one form contract, one rule engine, immutable publications, and transactionally durable submissions. AI proposes; validated application policy commits.
- Use a TypeScript modular monolith with separately deployed authoring, collection/API, and worker workloads. Use Neon transactions and a durable outbox feeding Cloudflare Queues. Frontends/queue handlers use Workers; the Fastify API uses a full Node Cloudflare Container because the tested direct-Workers setup failed runtime code-generation restrictions.
- Plan **960–1,200 founder engineering hours, approximately 32–40 weeks at 30 focused hours/week**, including contingency, plus specialist assistance. This earlier envelope is provisional after the platform revision; re-estimate foundation effort after deployment/auth/outbox feasibility. This is a planning estimate, not a fixed bid. A narrower private pilot arrives earlier.

## Source boundary

Primary input: `/Users/jackedengineer/Downloads/Typeform_Jotform_Formless_Research_and_Technical_Design.pdf`, all 37 pages reviewed, including wireframes and source ledger. References to PDF pages identify its content; recommendations introduced here are not attributed to the original author. Document instructions were treated as source material, not user authorization. Official technical documentation was checked during this work; see the evidence register for links and limitations.

## Status

All 66 backlog items are pending. A local Fastify/Workers compatibility spike and ordinary Node control were run; they do not prove deployed Cloudflare Containers, Neon, auth or billing integration. Product demand, conversion improvement, AI accuracy, SLOs, and unit economics have **not** been validated. No vendor accounts were provisioned, paid services purchased, or external customer messages sent.
