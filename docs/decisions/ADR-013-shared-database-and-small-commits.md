# ADR-013 — One shared database and incremental market V1

Accepted 28 October 2026 from the user's subsequent instructions.

Use one Neon project, one `production` branch and one `snapform` PostgreSQL database for development and production. Do not provision a test database or a development branch. Synthetic automated writes use explicit transactions that are rolled back; never truncate/reset shared tables. Browser fixtures are clearly labelled and never impersonate real customers. Shared storage is a shared trust boundary; development writes and migrations affect the same records.

The new Neon project is `royal-forest-49644322`, branch `br-patient-pine-aozmb8e1`, PostgreSQL 18, Singapore, free plan with autosuspend. The console labels its underlying managed region AWS; this is Neon-managed infrastructure. No application workload, object store or fallback is deployed to an AWS account. Neon Auth, storage, functions, realtime and AI gateway are not enabled. Credentials stay outside Git and public output. Migration ownership is separate from restricted runtime privileges within this same database.

Start with direct request-scoped Neon connections and Drizzle. Defer Hyperdrive, replicas, Redis and scaling infrastructure until measured needs justify them. Maintain narrow modules, bounded queries, transactions, authorization and migrations from the start; correctness and recovery are not scale optimizations.

Continue until the listed market V1 capabilities are built and verified, with normal/power/adversarial browser workflows and visual review. Use focused commits around 400–500 handwritten changed lines, with lockfiles/generated migrations separately identified in review. The earlier request for two small commits describes the immediate foundation batch; the later whole-V1 instruction extends the delivery target. Unimplemented or externally unverified capabilities remain explicitly incomplete.
