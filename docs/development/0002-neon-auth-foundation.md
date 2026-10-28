# Single-database and auth foundation

28 October 2026. [ADR-013](../decisions/ADR-013-shared-database-and-small-commits.md) records the user's shared-database and small-commit decisions. This is foundation evidence, not completion of account UI or market V1.

One Neon project/production branch/database is configured. PostgreSQL 18 runs in Neon's managed Singapore region on the free plan with autosuspend. No test database or extra branch was created. Migration ownership and the nonadministrative `snapform_runtime` login are distinct. Credentials are in ignored mode-0600 files: root `.env` for administration, API `.dev.vars` for runtime/auth configuration. No owner credential goes to a Worker.

Drizzle defines the four Better Auth tables with foreign keys, unique identity constraints and lookup/expiry indexes. Explicit, versioned migrations apply through `pnpm db:migrate`; startup does not migrate. `pnpm db:bootstrap` configures the runtime login once and refuses to rotate an existing login silently. Request-scoped Neon pools use one connection and must close in `finally`. No Hyperdrive, replicas, Redis or test database was introduced.

Six database tests use the restricted login. They cover actual connection, rollback, atomic duplicate rejection, nonadministrative role attributes, denial of schema DDL and sanitized invalid configuration. The privilege tests first failed using the owner role, then passed using the restricted login. Synthetic writes run inside transactions and roll back; no shared-table truncation/reset is used.

Two Better Auth/Neon integration tests cover forged verification, hashed passwords, denial of unverified/wrong-password sign-in, HttpOnly/SameSite cookies and immediate session revocation. Their fixtures also roll back. The factory requires a trusted origin and strong secret; cookie caching and telemetry are off, OAuth tokens are encrypted, implicit account linking is disabled and adapter transactions are enabled. The current SDK's `workerd` export uses native `node:crypto` scrypt; no custom cryptographic wrapper was added.

A third auth integration case runs inside actual workerd, connects to Neon, hashes a password, rejects forged verification and blocks unverified sign-in, then rolls back. The 16 Worker tests pass, including this platform gate.

API, web and database TypeScript projects are checked independently so generated Worker bindings do not merge across applications. CI now expects the restricted `SNAPFORM_DATABASE_URL` and `BETTER_AUTH_SECRET`; remote setup/run remains pending. Lockfile and generated migration metadata are reviewed separately from handwritten code.

The Neon UI confirmed one database and the runtime role's false create-database/create-role/bypass-RLS flags through a read-only SQL query. Its Roles list does not display the SQL-created login. Auth UI, email delivery, OAuth, MFA, workspace tenancy and business-table row policies are subsequent slices; they are not claimed verified by these factory tests. The shared database is a shared trust boundary, not environment data isolation.

- [Project creation](evidence/03-neon-project-created.png)
- [Runtime role checked through the browser](evidence/04-neon-runtime-role.png)

Sources: [Neon connection lifetime](https://neon.com/docs/serverless/serverless-driver#pool-and-client-usage-notes), [Drizzle/Neon](https://orm.drizzle.team/docs/connect-neon), [Better Auth Drizzle adapter](https://better-auth.com/docs/adapters/drizzle), [Better Auth security](https://better-auth.com/docs/reference/security), [Cloudflare native crypto](https://developers.cloudflare.com/workers/runtime-apis/nodejs/crypto/). Current pinned versions: Better Auth/adapter 1.7.14, Drizzle ORM 0.45.4, Drizzle Kit 0.31.11 and Neon driver 1.2.0. Native Node 24/WebSocket APIs suffice; no `ws` package was needed.
