# Snapform development contract

Read CONSTRAINTS.md before writing code. Do not weaken it to make a change pass.

- User-selected platform: React/TanStack Start, TypeScript/Express on Cloudflare Workers, Neon/Drizzle, R2 and Razorpay. Do not reintroduce a superseded framework/provider or alternate-cloud fallback.
- Use the one shared Neon database for development and production. Do not create a test database/branch. Roll back automated synthetic writes; never truncate/reset shared tables. Keep migration ownership out of runtime configuration.
- Keep focused commits around 400–500 handwritten lines, reviewing generated lockfiles/migrations separately.
- Build one small working slice at a time. Write a failing behavioral test before domain logic or a bug fix. Verify the real Worker boundary and affected browser journey, then commit the slice.
- Every user-facing feature needs normal-user, power-user and adversarial browser checks using local/staging synthetic data. Record expected/observed behavior and limitations. Never attack unrelated production services or use real customer data.
- Prefer native HTML, CSS, fetch, URL, Intl, AbortController, streams and Web Crypto. Add a dependency only for an implemented need; document its purpose, native alternative, license and measured runtime/bundle cost.
- Keep business rules pure and shared. The API repeats validation and authorizes every private operation. Client validation and route guards are not security boundaries.
- No unnecessary layers, factories, event buses, global stores or generic adapters. Keep feature code with its feature; extract only when it reduces concepts or establishes a real trust boundary.
- Never put secrets, session capabilities or raw answers in Git, URLs or operational logs. Do not replace missing production integrations with silent in-memory storage.
- Follow CONTRIBUTING.md: short-lived branches, focused Conventional Commits, tests/build/review before merge, no force-push to shared branches. No remote creation, deployment or live charge without user authorization.
- Report what was implemented, actual verification, measured performance and material unfinished integration. A passing test suite is evidence, not a promise of permanent correctness.
