# Dependency decisions

Only packages needed by an implemented slice are installed. Exact versions and transitive resolution are committed in pnpm-lock.yaml. This inventory was read from the installed package manifests on 28 October 2026; all runtime packages below are MIT licensed. Native HTML/CSS, fetch, URL, Intl, AbortSignal and Web Crypto cover controls, presentation, HTTP, dates, cancellation and request IDs.

## Installed runtime

| Package | Exact version | Purpose and native alternative |
|---|---|---|
| React / react-dom | 19.3.1 / 19.3.1 | Chosen UI renderer and hydration; handwritten DOM state would conflict with the selected frontend framework |
| @tanstack/react-start | 1.169.4 | Selected SSR/build framework on Workers; avoids owning SSR/hydration plumbing |
| @tanstack/react-router | 1.170.46 | Typed routes and document/error boundaries; native navigation remains used for full reloads |
| @tanstack/react-query | 5.105.0 | Remote mutation lifecycle, no retries on commands, no persisted mutation cache; native fetch performs transport |
| @tanstack/react-form | 1.33.5 | Required TanStack direction; field state, errors and shared-schema validation; controls remain native HTML |
| express | 5.3.0 | User-selected API middleware/router, only in the Worker bundle; not sent to browsers |
| zod | 4.6.7 | One shared runtime boundary for browser/API inputs and explicit review output; avoids inconsistent handwritten validation |

No database/auth/payment/AI/storage SDK, CSS framework, component kit, animation, date, utility, HTTP-client or global-store package is installed in anticipation of future work. Better Auth, Drizzle and provider integrations are selected in the full specification and will be reviewed when their slice is built.

## Measured cost and budgets

The first production build emitted about **153.2 KiB total client JS gzip**, **2.7 KiB CSS gzip**, and a **36.1 KiB Latin variable font**. The notification release measures 199.96 KiB JS, 7.85 KiB CSS and 36.07 KiB primary font. The separately loaded Latin Extended font is about 17.8 KiB. These are emitted sizes, not isolated per-library attribution or actual network transfer on every visit. The user-approved [ADR-022](decisions/ADR-022-route-performance-budgets.md) establishes per-route JS limits and a 230 KiB aggregate ceiling; CSS remains 20 KiB and primary font 40 KiB. `pnpm check:bundle` gates all of them. The graph checker reuses the existing development-only TypeScript compiler rather than adding a parser dependency; no browser/Worker runtime bytes are added.

The web auxiliary Express Worker bundle is about 313.7 KiB gzip; the standalone Wrangler API dry-run is about 419.6 KiB gzip because its bundler differs. Neither contributes to browser JS. No database/model/network latency or hosted CPU budget is established by those sizes. Inspect the artifact and measure runtime before changing libraries.

## Development-only tools

Cloudflare Vite plugin 1.65.0, Cloudflare Vitest plugin 1.4.9, Vite 8.3.5, React Vite plugin 6.1.2, Wrangler 4.154.0, Vitest/coverage-v8 5.0.5, ESLint 10.13.0, @eslint/js 10.0.1, typescript-eslint 8.72.1, globals 17.4.0 Prettier 3.9.10 and the pinned @types packages are tooling. Prettier provides consistent reviewable formatting and a CI check; it adds no application runtime code. Their package licenses are MIT, except Wrangler (MIT OR Apache-2.0). TypeScript 6.0.3 is Apache-2.0. TypeScript 7 was rejected because the lint parser does not support it; no peer override was used.

The official test plugin requires Vitest 4.1+ or 5; 5.0.5 is pinned. Local Workers compatibility date is 2026-10-23, supported by both pinned runtime toolchains. Generated runtime declarations are reproducible and ignored; generated route types are committed. `pnpm audit --prod --audit-level high` is a blocking CI check; an audit is time-specific evidence, not a permanent assurance. Transitive notices remain in package distributions/lockfile; review them before distributing a release.


## Database/auth foundation additions

Neon serverless driver 1.2.0 and Drizzle ORM 0.45.4 supply request-scoped interactive Postgres transactions. Better Auth and its official Drizzle adapter 1.7.14 supply established credential/session policy. Drizzle Kit 0.31.11 is development-only schema generation. These packages are MIT licensed. Node 24 and Workers already provide WebSocket and native crypto; no `ws`, hashing wrapper, connection proxy or new browser dependency was added. The auth factory is not yet exposed as a completed user interface.

The audit found GHSA-67mh-4wv8-2f99 in Drizzle Kit's legacy esbuild transform helper (0.18.20). A scoped pnpm override selects already-used esbuild 0.25.12 for that helper. CLI generation and the checks validate the change rather than applying a forced blanket upgrade. The two deprecated esbuild-kit helper packages remain tooling dependencies; no esbuild development server is started by the application. [Primary advisory](https://github.com/evanw/esbuild/security/advisories/GHSA-67mh-4wv8-2f99).

Better Auth uses its officially documented `better-auth/minimal` initializer with the Drizzle adapter. Standalone API upload fell from 808.68 to 704.61 KiB gzip (104.07 KiB removed); no auth code is added to the browser bundle by the server integration. Native fetch handles Resend; no additional email SDK is installed.

## Response job Worker

`apps/jobs` reuses the existing contracts, Drizzle and Neon driver. Native
Cloudflare Cron/Queues and structured JSON logs add no external SDK or browser
runtime. The standalone job artifact is 216.26 KiB gzip (deployment startup
24 ms); client assets are unchanged by this workspace. No license or transitive
package graph changed; the lockfile adds workspace links only.

## Operator recovery tooling

Recovery scripts use native Node streams, filesystem operations and AES-256-GCM;
no npm package, S3 SDK or application runtime dependency is added. The absent
system `pg_dump` is supplied by the already installed local Docker engine and
its existing official PostgreSQL 18.6 Alpine image, pinned to digest
`sha256:77f585114c32fbca283dc835b0596f4e52b51b4c6662d7810b2f4084f60a1873`.
The PostgreSQL clients use the PostgreSQL License. Exporting runs only client
commands and creates no database. A separately approved local restore drill used
a disposable server with network mode none and no ports, then removed it. Docker must target a local Unix
socket; database secrets reach the client through environment, never arguments.
Native installed PostgreSQL clients are the alternative. This tooling adds
zero browser/API/Jobs bundle bytes. The first encrypted operator export measured
190,162 bytes for 22 table-data entries; that is export integrity evidence,
not restore or automated backup completion.
