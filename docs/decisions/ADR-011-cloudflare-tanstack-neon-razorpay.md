# ADR-011 — Use TanStack, Cloudflare, Neon and Razorpay

## Status

**Superseded by ADR-012.** This is a historical record, not the active deployment plan.

Accepted for the user-specified provider/framework direction on 28 October 2026. Fastify Containers, Better Auth and queue implementation details are recommended baselines pending the stated deployment/integration gates. No live service is provisioned.

Supersedes ADR-004's proposed pg-boss deployment and the hosted-auth/provider choices under ADR-005; refines ADR-002/003 without replacing the shared engine, Postgres or Drizzle. Earlier proposal snapshots are retained under `docs/archive/platform-baseline-2026-10-28/`; ADR-001 through ADR-010 remain in the original decision register with status annotations.

## Context

The user requires TanStack Start for all frontends, TanStack application libraries, Cloudflare-first deployment with AWS fallback, Neon managed Postgres with Drizzle, R2/S3 objects, Razorpay using the existing account, and no Supabase. The user asks whether Go's concurrency justifies changing the Fastify API and which backend is easier on Cloudflare.

## Decision

Use TanStack Start/Router/Query/Form and selective TanStack utilities; React remains the UI framework. Retain TypeScript/Fastify. Deploy Start/edge/queue/scheduled handlers on Cloudflare Workers and the full-Node API/scanner on Cloudflare Containers, subject to operating gates. Use Neon/Drizzle, private R2, Razorpay Subscriptions and a Neon transactional outbox feeding Cloudflare Queues. Recommend Better Auth with Neon/Drizzle to fill the removed auth service. Use AWS ECS/Fargate for a container workload that fails Cloudflare gates; use S3 through the storage interface when a justified storage/recovery constraint requires it.

## Alternatives considered

- Complete Go rewrite: native CPU parallelism can help a profiled subsystem, but actual API bottlenecks are unmeasured; loses direct Drizzle use and shared TypeScript logic. Not selected for V1.
- Fastify directly in Workers: documented Node HTTP bridge is insufficient for the tested unmodified router/compiler, which attempted disallowed dynamic string evaluation. No runtime-security bypass or dependency fork selected.
- Replace Fastify with an edge-native router: could simplify an isolate-only API, but the user's Fastify choice is retained; revisiting it is a separate decision.
- Keep pg-boss daemon: does not fit an ephemeral queue-handler deployment; outbox + Queues selected. Do not assume distributed atomic commit.
- Install every TanStack package: adds maturity and bundle risk without a product job; record explicit adoption/defer decisions instead.
- Keep removed providers or start AWS-first: contrary to the user's direction.

## Consequences

All frontends share the TanStack approach, but have isolated deployments/caches/bundles. Hosted identity moves to a reviewed auth library and owned session operation. Queue publication moves outside the DB transaction, so outbox/dedupe/reconciliation become explicit foundation tasks. Container lifecycle, placement and rollout need a deployed feasibility proof; local Node success does not prove Cloudflare production readiness. Billing UI/cancellation must follow Razorpay semantics rather than assume a hosted portal. Revised costs and foundation effort must be re-estimated after feasibility.

## Evidence and acceptance

[Research, ecosystem assessment, Go comparison and gates](../09-platform-stack-decision.md); [technical contracts](../03-technical-foundation.md); [local compatibility evidence](../evidence/fastify-cloudflare-compat/worker-result.txt). T03/T05 test container startup/routing/failure recovery, Neon transaction isolation, queue recovery, auth cookies, R2 quarantine and Razorpay test-mode lifecycle. Record runtime/image/configuration versions and actual outcomes before marking deployment proven.
