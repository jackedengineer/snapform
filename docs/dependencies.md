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

The first production build emits about **153.2 KiB total client JS gzip**, **2.7 KiB CSS gzip**, and a **36.1 KiB Latin variable font**. The separately loaded Latin Extended font is about 17.8 KiB. Shared validation and TanStack Form are part of the route chunk; React/Router/Query/Start are part of framework/chunk output. These are emitted aggregate sizes, not isolated per-library attribution or actual network transfer on every visit. `pnpm check:bundle` computes exact current bytes and blocks JS >200 KiB, CSS >20 KiB or primary font >40 KiB.

The web auxiliary Express Worker bundle is about 313.7 KiB gzip; the standalone Wrangler API dry-run is about 419.6 KiB gzip because its bundler differs. Neither contributes to browser JS. No database/model/network latency or hosted CPU budget is established by those sizes. Inspect the artifact and measure runtime before changing libraries.

## Development-only tools

Cloudflare Vite plugin 1.65.0, Cloudflare Vitest plugin 1.4.9, Vite 8.3.5, React Vite plugin 6.1.2, Wrangler 4.154.0, Vitest/coverage-v8 5.0.5, ESLint 10.13.0, @eslint/js 10.0.1, typescript-eslint 8.72.1, globals 17.4.0 Prettier 3.9.10 and the pinned @types packages are tooling. Prettier provides consistent reviewable formatting and a CI check; it adds no application runtime code. Their package licenses are MIT, except Wrangler (MIT OR Apache-2.0). TypeScript 6.0.3 is Apache-2.0. TypeScript 7 was rejected because the lint parser does not support it; no peer override was used.

The official test plugin requires Vitest 4.1+ or 5; 5.0.5 is pinned. Local Workers compatibility date is 2026-10-23, supported by both pinned runtime toolchains. Generated runtime declarations are reproducible and ignored; generated route types are committed. `pnpm audit --prod --audit-level high` is a blocking CI check; an audit is time-specific evidence, not a permanent assurance. Transitive notices remain in package distributions/lockfile; review them before distributing a release.
