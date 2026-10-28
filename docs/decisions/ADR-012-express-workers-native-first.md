# ADR-012 — Express on Workers with native-first delivery

## Status

Accepted by the user on 28 October 2026. Supersedes ADR-011's API runtime/provider fallback choices. Prior decisions remain in history.

## Decision

Use TypeScript and Express 5 on Cloudflare Workers, preserving TanStack frontends, Neon/Drizzle, R2, Razorpay and the shared deterministic engine. Node LTS remains the development/build toolchain. No alternate-cloud provider or failover is in the plan. Cloudflare-specific workload incompatibility blocks that feature until a viable Cloudflare design is proven.

Use native browser/language/platform APIs first. Add a dependency only for a current need, with license/size/transitive-cost review and a measured bundle gate. Prefer simple functions and focused modules over speculative adapters.

Build in small verified slices. Write failing behavioral tests before domain logic, test real workerd API boundaries, then exercise complete local/staging workflows as a normal user, power user and adversarial user. Capture results and performance evidence. Never claim tests ensure permanent correctness; new failures become regression tests.

Use a local Git repository, short-lived feature branches, atomic Conventional Commits, pinned lockfiles, blocking CI and review before merging. Production deploys and protected remote settings are explicit setup actions; no remote repository has been created by this decision.

## Evidence and consequences

The existing Express 5.3.0 local probe passed nine compatibility cases. It does not prove the full auth/database/payment journey. Express requires explicit request validation, output DTOs, raw-body ordering and centralized sanitized errors. Queue publication stays outside the DB transaction and is recovered through the outbox. Native scanner operations remain separate from HTTP Workers.

[Technical specification](../03-technical-foundation.md), [V1 and execution order](../11-v1-scope-and-delivery.md), `CONSTRAINTS.md` and `CONTRIBUTING.md` define implementation gates.
