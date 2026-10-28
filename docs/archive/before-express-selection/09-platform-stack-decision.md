# Platform revision — TanStack, Cloudflare, Neon and Razorpay

**28 October 2026 · User-directed architecture revision.** This supersedes the earlier provider/framework recommendations. It updates the plan; no account, production deployment or live payment was created.

## 1. Decisions and boundaries

| Layer | Current selection | Replaces / consequence |
|---|---|---|
| Every frontend application | React + TanStack Start, using Vite and TanStack Router | Next.js and the independently assembled React/Vite collector framework; keep the collector deployment/bundle separate |
| Frontend data and form state | TanStack Query + Form | React Hook Form removed; canonical domain rules remain in the shared engine |
| Local state and utilities | TanStack Store; Pacer/Hotkeys where needed | Zustand removed; immature utility APIs isolated and pinned |
| API language/framework | TypeScript + Fastify | Retained; Go considered, not selected for a speculative speedup |
| Preferred compute | Cloudflare Workers for Start/edge/queue handlers; Cloudflare Containers for Fastify and native scanning | Render removed; full Node runtime where Fastify needs it |
| Database and ORM | Neon PostgreSQL + Drizzle | No Supabase database, auth, storage, upload or other service |
| Authentication | Better Auth with Neon/Drizzle, proposed integration baseline | Hosted auth removed; early implementation must prove verification/reset/MFA/revocation and secure sessions |
| Objects | Private R2; AWS S3 adapter/fallback | R2 is object storage, not the primary relational database |
| Billing | Razorpay Subscriptions + Standard Checkout | Stripe removed; use founder's existing account, build Snapform's billing-management UI |
| Jobs | Cloudflare Queues + Cron + transactional Neon outbox | pg-boss daemon removed from the selected deployment |
| Runtime fallback | AWS ECS/Fargate for a workload that fails Cloudflare gates | No unrequested return to Render; no automatic multi-cloud failover claimed |

The complete library and service inventory is in [technical foundation](03-technical-foundation.md). Foundation 0.2 colors, typography and interaction contracts remain intact.

## 2. TanStack ecosystem assessment

The [official library catalog](https://tanstack.com/libraries) was inspected on the revision date. It lists Start, Router, Redact, Query, DB, AI, Store, Table, Charts, Form, Markdown, Highlight, Virtual, Pacer, Hotkeys, Intent, Devtools, Config and CLI. Relevant React documentation was used to map responsibilities. A shared vendor name does not make these a single release train or establish equal maturity.

| Offering | Decision for Snapform | Reason / boundary |
|---|---|---|
| Start | Core for web, marketing/help and collector | Routing/rendering/server integration; official Cloudflare deployment path; keep collector code split |
| Router | Core through Start | Typed routes, parameters/search and route loading; route guards are not API authorization |
| Query | Core | Server-owned data cache and mutations; SSR isolation, tenant-key partitioning and identity cache clearing required |
| Form | Core | Field state, validation feedback, submission and async input checks; shared engine owns form semantics |
| Table | Core for response/delivery lists | Headless table state, server-side cursors/filtering; retain our design system |
| Virtual | Conditional on measured list cost | Window large visible lists; do not use it as justification to download an entire response database |
| Store — alpha in catalog | Small isolated editor-state adapter | User preference replaces Zustand; pin API, test changes and retain an internal interface |
| Pacer — beta | Optional debouncing/throttling/batching | Useful for search/autosave scheduling; does not enforce server budgets or durable job delivery |
| Hotkeys — beta | Optional authoring shortcuts | Respect input focus/IME and shortcut scopes; always offer ordinary accessible controls |
| AI | Selected typed server/provider and React streaming integration | Keep model controls, validation, source evidence and financial reservations in our own boundary; exclude experimental agent harness |
| DB — beta | Defer until a client collection/live-query need is proven | A reactive client store above APIs, **not** Neon, a database server, an ORM or an authorization layer |
| Charts | Optional after real funnel data exists | Simple trustworthy metrics first; no decorative charts or fake empty-state data |
| Markdown | Defer | V1 knowledge and messages are bounded plain text; rich rendering adds sanitization/URL-policy work |
| Highlight | Defer except a justified diagnostics surface | Plain code/payload rendering is enough initially; avoid collector syntax-highlighting weight |
| Devtools — alpha | Development only | Debug Query/Form/Router as supported; no debug panel or sensitive caches in public production bundles |
| CLI — alpha | Scaffold/tooling candidate | Inspect generated output, select the official Cloudflare/Vite path, commit compatible pins and lockfile |
| Config | Evaluate for tooling only | Useful shared configuration; retain project CI/security requirements rather than installing publishing conventions wholesale |
| Intent — alpha | Optional developer workflow only | Package documentation/skill loading is separate from application runtime; no persistent agent hooks installed as part of this change |
| Redact | Defer | Newly introduced React/DOM alternative is not required to deliver V1; React remains selected until compatibility/accessibility/library evidence supports a change |

TanStack libraries are largely headless. Tailwind, shadcn/ui, Radix and Lucide remain useful; dnd-kit still owns drag/reorder mechanics. No TanStack offering automatically replaces the deterministic form engine, API authorization, billing ledger or durable handoff. [Form overview](https://tanstack.com/form/latest/docs/overview), [Table overview](https://tanstack.com/table/latest/docs/overview), [DB overview](https://tanstack.com/db/latest/docs/overview), [Store overview](https://tanstack.com/store/latest/docs/overview).

TanStack Start has an official [Cloudflare guide](https://developers.cloudflare.com/workers/framework-guides/web-apps/tanstack-start/). Use the supported Vite adapter rather than mixing deployment adapters. SSR Query clients must be per request; never share authenticated cache state between requests. TanStack AI's [OpenAI adapter](https://tanstack.com/ai/latest/docs/adapters/openai) provides the selected provider/React transport boundary; test refusals, strict outputs, provider non-storage settings, cancellation and token accounting before replacing a direct SDK call. Do not put a provider key in the browser.

## 3. Would Go improve performance?

**Potentially for CPU-heavy work in a native multi-core runtime; not automatically for our API.** Go's goroutines provide convenient concurrency, and native Go can execute CPU work across available cores. JavaScript runtimes already support concurrent I/O; Cloudflare Workers explicitly processes overlapping asynchronous requests. Concurrency and CPU parallelism are different properties. [Go concurrency/parallelism](https://go.dev/doc/effective_go#concurrency), [Node event-loop guidance](https://nodejs.org/en/learn/asynchronous-work/dont-block-the-event-loop), [Workers execution model](https://developers.cloudflare.com/workers/reference/how-workers-works/).

Snapform's expected critical operations are database transactions, auth/session lookups, object access and provider calls. Their actual latency breakdown is not measured yet. Rewriting the HTTP layer cannot remove database distance, connection setup, lock contention, extra round trips or model latency. Start with bounded queries/transactions, connection budgets, streaming uploads/exports, async I/O, caching only where correct, and separate heavy work from submission.

Go is a reasonable future choice for a profiled CPU-heavy transformation or import worker. It is not a reason to duplicate the complete form engine, auth/billing contracts and deployment toolchain before an end-to-end slice exists. A full Go backend also conflicts with keeping Drizzle as its ORM: Drizzle executes in TypeScript/JavaScript. Go can consume SQL migrations against the same Postgres schema, but runtime queries would need Go drivers/SQL generation and a reviewed contract boundary. A TypeScript database-proxy service adds latency and operating burden and is not selected.

Benchmark any Go proposal on the same hardware/CPU quota, Neon region, dataset, TLS/connection reuse and business semantics. Compare p95/p99 latency, error rate, CPU, memory, throughput and total cost, including warm/cold states and developer maintenance. No Node-versus-Go production benchmark was performed in this revision; no speedup percentage is claimed.

## 4. Which backend is easier on Cloudflare?

| Deployment | Fastify / TypeScript | Go |
|---|---|---|
| Workers isolate | Node compatibility helps imports/HTTP, but the tested default router/compiler failed dynamic-code restrictions; not selected as a drop-in deployment | Go can compile to Wasm, but a conventional `net/http` service needs an adapter/host boundary; do not assume native Go threads/parallelism or library compatibility |
| Cloudflare Containers | Conventional Node Docker image, compatible with Drizzle/shared TypeScript; selected path | Conventional Go Docker image; viable, but Drizzle cannot be its runtime ORM and shared logic needs cross-language contracts |
| AWS ECS/Fargate fallback | Same Node image with platform adapters/configuration | Same Go image with platform adapters/configuration |

Cloudflare's [Containers quickstart](https://developers.cloudflare.com/containers/get-started/) actually uses a Go HTTP server, so Go itself is not difficult to containerize. **For this complete product, Fastify is the easier baseline because it preserves the existing TypeScript/Drizzle/domain packages.** For an isolated minimal HTTP container, both are straightforward. [Workers languages/Wasm](https://developers.cloudflare.com/workers/languages/), [AWS Fargate](https://docs.aws.amazon.com/AmazonECS/latest/developerguide/AWS_Fargate.html).

### Local compatibility evidence

An isolated `/tmp/` spike installed Fastify 5.12.7, Wrangler 4.154.0, workerd 1.20261023.1 and the planned Cookie/CORS/Helmet/Swagger plugins; ordinary Node was v24.14.0. The Worker used the documented `cloudflare:node` HTTP bridge and a pinned compatibility date. Initial top-level plugin awaits did not settle; deferring `ready()` to a request reached initialization but failed at router `new Function`. A schema compiler also attempted runtime generation. The ordinary Node control returned health 200, preserved two cookies, returned 200 for valid input and 400 for invalid input.

[Diagnostic report](evidence/fastify-cloudflare-compat/worker-result.txt), [Worker source](evidence/fastify-cloudflare-compat/worker.mjs), [Node control](evidence/fastify-cloudflare-compat/node-control.mjs), [versions](evidence/fastify-cloudflare-compat/package.json), [results](evidence/fastify-cloudflare-compat/node-results.json).

This narrows the default deployment choice; it does not prove all future Fastify versions or custom compile strategies fail. No unsafe runtime bypass, router fork or remote deployment was attempted. Sources explain the boundary: [Node HTTP bridge](https://developers.cloudflare.com/workers/runtime-apis/nodejs/http/#httpserverhandler), [dynamic-code restrictions](https://developers.cloudflare.com/workers/runtime-apis/web-standards/), [Fastify compilation warning](https://fastify.dev/docs/latest/Reference/Validation-and-Serialization/).

## 5. Consequential foundation changes

**Queues:** Postgres and Cloudflare Queues cannot be committed in one transaction. Persist response, event, usage and an outbox row atomically; publish after commit through a retryable relay. A crash can duplicate dispatch, so consumers and external effects need stable IDs, dedupe and reconciliation. Cloudflare Queues is at least once, not a substitute for the billing/send ledger. A one-minute Cron sweep recovers missed dispatch; Neon retains jobs beyond queue retention. [Queue guarantees](https://developers.cloudflare.com/queues/reference/delivery-guarantees/).

**Neon:** Use bounded `pg` pools inside containers and request-local `pg` clients through Hyperdrive in Workers needing SQL. Turn off Hyperdrive query caching for authoritative/session/permission/entitlement data; it does not invalidate cached results after writes. Keep an interactive transaction on one connection with transaction-local tenant context. The Neon HTTP driver is an alternative for suitable reads/non-interactive batches, not a blanket substitution for that transaction contract. [Drizzle/Neon](https://orm.drizzle.team/docs/connect-neon), [Hyperdrive behavior](https://developers.cloudflare.com/hyperdrive/concepts/how-hyperdrive-works/).

**Auth:** Better Auth plus its official Drizzle adapter keeps identities/sessions in Neon. Mount one authority in Fastify; route it under the creator's same origin, with trusted origins/cookie protections and Resend verification/reset mail. Library adoption does not replace session revocation, MFA/recovery, enumeration protection, reauthentication and tenant authorization tests. [Official integrations](https://better-auth.com/docs/integrations/fastify), [Drizzle adapter](https://better-auth.com/docs/adapters/drizzle).

**R2:** Upload privately to quarantine with bounded object IDs/capabilities. Verify size/content and maintained malware scanning before marking clean. Scanner needs a container; ordinary Workers is not a ClamAV process host. Treat presigned URLs as short-lived bearer capabilities. Do not assume complete feature parity with S3 or that Neon backups contain object bytes. [R2 signing](https://developers.cloudflare.com/r2/api/s3/presigned-urls/), [R2 retention locks](https://developers.cloudflare.com/r2/buckets/bucket-locks/), [Neon backups](https://neon.com/docs/postgres/backup-restore/backups).

**Razorpay:** Existing account selection is accepted. Prove Subscription configuration and intended currency/method/customer coverage in test mode, implement Standard Checkout, verify callback/webhook signatures appropriately, dedupe and reconcile events, and expose owner billing/cancellation inside Snapform. Do not assume Stripe's Customer Portal or its proration behavior exists under another name. The $49 USD offer remains a commercial experiment until charge currency/market support is resolved; no exchange rate or INR price is invented. [Subscriptions](https://razorpay.com/docs/payments/subscriptions/), [integration](https://razorpay.com/docs/payments/subscriptions/integration-guide/), [webhook verification](https://razorpay.com/docs/webhooks/validate-test/).

## 6. Deployment gates, cost and schedule

Before broad implementation, deploy a synthetic Start → ingress → Fastify container → Neon transaction → outbox → queue → consumer slice, with a private R2 upload and test-mode Razorpay event. Check idle/warm startup and p95/p99 submit timing, multiple replica replacement, routing, streaming/cancellation, multi-cookie auth, DB transaction/pool isolation, queue duplicates, scanner outage, secret injection, telemetry and rollback. The local Fastify test is not a completed Cloudflare Containers proof.

Cloudflare's [routing guide](https://developers.cloudflare.com/containers/configuration/scaling-and-routing/) documents explicit instance/lifecycle management. Establish an initial bounded instance pool, routing/readiness behavior and how capacity changes; do not promise automatic replica scaling from the word “serverless.” No production response/session state goes on container disk. If capacity/latency/placement/rollout requirements cannot be met within the spike, move that container workload to AWS ECS/Fargate; preserve frontend, database and storage contracts. This is a fallback plan, not deployed disaster failover.

Retain the earlier **32–40 week / 960–1,200 hour** estimate only as a provisional whole-product envelope. Self-hosted auth, container operations and the outbox relay change foundation effort; re-baseline at T03/T05 before making a launch commitment. Keep the commercial/security/recovery bar. The revised operating bands in the business plan are assumptions, not current provider quotes; deployment mode, warm capacity and database restore settings must be priced from actual configuration.
