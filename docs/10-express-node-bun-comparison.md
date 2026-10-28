# Node/Express and Bun/Express versus the Fastify baseline

**28 October 2026 · Evaluation, not a framework-selection change.** The current architecture baseline remains Fastify on a full Node container. This follow-up identifies Express on Workers as a credible alternative to validate before freezing API deployment. No account, remote deployment or live payment was used.

## Distinguish the two choices

Express and Fastify are HTTP application frameworks. Node, Bun and Cloudflare workerd are execution runtimes. Node + Express changes the framework from our current Node + Fastify baseline. Bun + Express changes both the framework and runtime. Both Express alternatives can retain TypeScript, Neon, Drizzle and the shared domain engine.

Cloudflare Workers executes compatible JavaScript in **workerd**; it does not launch a full Node or Bun process. Node-compatible imports allow Express to use parts of the Node API. Installing dependencies or building with Bun does not make a deployed Worker run Bun. An actual Bun process belongs in a Cloudflare Container or an AWS container fallback. [Cloudflare HTTP bridge](https://developers.cloudflare.com/workers/runtime-apis/nodejs/http/), [Express on Workers](https://developers.cloudflare.com/workers/tutorials/deploy-an-express-app/), [Bun Express guide](https://bun.sh/guides/ecosystem/express).

## Framework tradeoffs

| Concern | Fastify | Express 5 |
|---|---|---|
| Application structure | Encapsulated plugins/hooks and schema-oriented route contracts | Middleware/router composition; define module and error/validation conventions ourselves |
| Input validation | Integrated schema compilation; alternative validator hooks available | Explicit Zod validation middleware/route wrapper; domain engine remains authoritative |
| Response shape | Response schemas can constrain/serialize selected properties | Explicit response DTOs/output schemas; returning a whole database row is not acceptable |
| TypeScript | First-party types and typed route/type-provider patterns | Supported through TypeScript types and a shared typed wrapper; request generics alone do not validate data |
| Errors | Framework error handling integrated with validation/hooks | Express 5 forwards rejected async-handler promises; still needs a centralized sanitized error handler |
| OpenAPI/logging | Established Swagger plugin and logger integration | Deliberately wire contract documentation, request IDs and structured logging; avoid per-route drift |
| Performance | Compiled schemas/serializers can reduce framework overhead | Extra middleware and manual parsing/serialization determine overhead; no workload speed ranking measured here |
| Ordinary Workers | Tested default router/compiler failed string-code generation restrictions | Official Cloudflare guide and successful local representative probe; full dependency integration still pending |
| Node container | Retained baseline; local control passed representative checks | Conventional supported deployment; preserves an AWS fallback path |

Neither framework is automatically secure or automatically understands the form DSL. Tenant authorization, stable IDs, submission transactions, outbox recovery, billing invariants, uploads and AI policy remain application responsibilities. [Fastify validation/serialization](https://fastify.dev/docs/latest/Reference/Validation-and-Serialization/), [Express error handling](https://expressjs.com/en/guide/error-handling/), [Express performance guidance](https://expressjs.com/en/advanced/best-practice-performance/).

## Node versus Bun with Express

Node + Express retains the current Node runtime/tooling approach and uses the Express middleware ecosystem. Bun documents running Express through its Node HTTP compatibility layer. Bun may change startup, execution, memory and HTTP behavior, but no lower latency or cost for Snapform has been established. Do not use native `Bun.serve` benchmark numbers as an Express/Neon/Better Auth/Razorpay benchmark.

Bun's official compatibility reference lists both supported and partial Node APIs. Test the exact database transport, auth/password hashing and cookies, Razorpay SDK, raw-body signatures, file streams, cancellation, tracing/error reporting and graceful shutdown before choosing Bun. A minimal Express hello-world does not prove the complete stack. Bun remains a viable container candidate, not an inherently unsuitable production runtime. [Express on Bun](https://bun.sh/guides/ecosystem/express), [Node compatibility](https://bun.sh/docs/runtime/nodejs-compat).

For our expected database/provider-heavy workload, address SQL round trips, pool limits, physical database distance, long transactions and synchronous CPU work before assuming a runtime swap fixes performance. Keep any CPU-heavy processing off the submit path. Compare candidates on equal resources, identical business logic and the same Neon region, measuring p95/p99, errors, CPU/memory, throughput and cost. No such comparative benchmark was run.

## What was actually checked

The local probe used **Express 5.3.0, Zod 4.6.7, Helmet 8.3.0, CORS 2.8.6, cookie-parser 1.4.7, Wrangler 4.154.0 and workerd 1.20261023.1**, with compatibility date 2026-10-28 and Node compatibility enabled. It used Cloudflare's documented HTTP bridge and no database binding. The D1 example in Cloudflare's tutorial was not adopted: Neon remains selected.

All nine asserted cases passed in local workerd:

1. Health response: 200.
2. Two independent Set-Cookie headers preserved, with HttpOnly/Secure/SameSite flags.
3. Valid integer input: 200.
4. Wrong input type: 422.
5. Unknown input property: rejected with 422.
6. Original whitespace-bearing raw webhook body verified using a synthetic HMAC secret: 200.
7. Changed body with the original signature: rejected with 401.
8. Rejected async handler: sanitized 500, without its private diagnostic.
9. SSE event framing/content type and completion event returned correctly.

Allowed-origin CORS and `nosniff` headers were observed. This does not establish blocked-origin authorization, full browser cookie behavior, streaming timing/backpressure, client-disconnect propagation, real MFA/session behavior or actual Razorpay verification. The example error handler is probe code, not a production error/validation contract. No Node-versus-Bun performance benchmark or Bun runtime test was performed; Bun was not installed. No deployed Worker/Neon/Better Auth/Razorpay end-to-end test was performed.

[Probe source](evidence/express-cloudflare-compat/express-app.mjs), [Worker entry](evidence/express-cloudflare-compat/express-worker.mjs), [configuration](evidence/express-cloudflare-compat/wrangler-express.jsonc), [versions](evidence/express-cloudflare-compat/versions.json), [asserted results](evidence/express-cloudflare-compat/express-worker-results.json). Earlier Fastify evidence is in [the previous spike](evidence/fastify-cloudflare-compat/worker-result.txt).

## Recommendation for this product

Given the Cloudflare-first preference, **evaluate Express 5 on Workers before committing the API to Fastify Containers**. The deployment simplification is better supported by current evidence than a speculative Bun speedup. Retain TypeScript/Zod/Drizzle/domain packages, and prove Neon transactions/tenant context, Better Auth cookies/MFA, Razorpay SDK/signatures, R2 capabilities, queue recovery, telemetry and real streaming in staging. Use explicit validation/output wrappers so the lightweight framework does not weaken API contracts.

If that integration passes, Express can remove the API's dependency on container lifecycle and routing. The isolated native scanner still needs a container. If a required library or operating limit fails, Node + Express can run in Cloudflare Containers/AWS without changing the domain engine. Bun + Express is worth selecting only if compatible full-stack measurements justify another runtime; it does not provide a Bun runtime inside ordinary Workers.

This report records an alternative and a recommended next feasibility choice. It does not amend ADR-011 or replace Fastify in the accepted blueprint merely because the user asked a comparison question.
