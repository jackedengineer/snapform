# Slice 1 — bounded brief validation and editable review

**Verified locally: 28 October 2026. Source commit: `c1be101`.** This is a working application slice, not a shipped market V1. The [V1 contract](../11-v1-scope-and-delivery.md) and [technical specification](../03-technical-foundation.md) remain the full scope.

## Implemented behavior

A person enters a goal, whole-unit budget, explicit currency and calendar date. TanStack Form validates the shared contract. Native fetch sends the bounded JSON to the same-origin web Worker; a Cloudflare service binding reaches Express in workerd. The server repeats strict validation and returns an explicit checked-brief DTO. Review renders plain text with Intl formatting; editing preserves values and moves focus back to the goal. Pending requests disable the fieldset. A connection failure shows an alert and keeps the details available for retry.

The interface clearly says this is a preview and responses are not sent or saved. Refresh resets the preview. There is no account, database, file, payment, AI, submission identity or fake persistence layer. One focused feature directory and one API entry avoid speculative service/repository/state abstractions. Native semantic controls, CSS/design tokens, self-hosted DM Sans and reduced-motion timing are used.

## Automated verification

`pnpm check` passed generated runtime types, strict TypeScript, zero-warning ESLint, the following tests, production builds, emitted bundle budgets and an isolated production preview smoke check. `pnpm audit --prod --audit-level high` reported no known vulnerabilities. `git diff --check` passed. These are local results; the committed CI workflow has not run on a remote.

- **35 contract cases:** whitespace normalization, zero/negative/fractional/oversized/non-numeric budgets, explicit supported currency, short/long goals, semantic calendar dates/leap day, unknown keys, form-text conversion and strict output shape.
- **15 workerd HTTP cases:** success/output/headers, zero, invalid bodies/keys/dates, markup as JSON data, malformed/oversized bodies, media types, cross-site/opaque/same-origin requests, unimplemented routes and repeated validation.
- **Development reload regression:** isolated Wrangler/Vite processes; temporary middleware header proves two API edits replace the handler without the Vite Node-listener conflict. Source is restored and concurrent edits are protected.
- **Production HTTP regression:** actual SSR content, matching nonce on every inline hydration script, a different nonce per request and web → service binding → Express review.

Test-first evidence: the contract suite initially failed because its implementation did not exist; after the contract was added all 35 cases passed. The Worker suite initially had 14 failures against the empty route. The same-origin case then caught the Node bridge protocol issue before all 15 passed. Coverage reports 4/4 contract declarations executed and no owned branches/functions in that file. It does **not** establish total-application coverage; the behavioral assertions and runtime/browser checks provide separate evidence.

## Real browser checks

The application was exercised in the in-app browser against local Workers using synthetic data, including the production build with CSP enabled. The development command also completed the same review flow; final screenshots capture its corrected styles.

| Mode | Actions and observed result |
|---|---|
| Normal user | Entered a consulting brief, USD 7,500 and 15 January 2027; reached correct server-checked review. Edit preserved all details and focused the goal. |
| Power user | Keyboard navigation moved from budget to currency; zero INR stayed ₹0; repeated review clicks showed pending then one review view; edit/review cycles retained values. Refresh cleared the unsaved preview as disclosed. |
| Adversarial user | Hostile-looking image/onerror text rendered literally with zero injected images. Short goals, negative budgets and a tool-entered 1,100-character goal were blocked with associated errors and first-invalid focus. Actual HTTP tests separately bypassed the browser for forged keys, malformed/oversized bodies and origin checks. |
| Failure/recovery | Stopped the local server before review; the browser showed the retry alert and retained the answers. Restarting the server and retrying reached correct review. |
| Responsive/accessibility spot checks | Review reflowed with no horizontal overflow at 320, 375, 768, 1024 and 1440px. At 375px all four controls had labels and at least 46px height; required semantics, focus transfer and native keyboard input were checked. Final browser checks emitted no new warn/error console entries. |

A direct automation fill did not complete the native date segments; using the actual day/month/year controls did. This is a browser-control limitation, not evidence of a date-parser failure. The supplied date was checked in the control and final review.

These are bounded spot checks, not a complete WCAG audit, screen-reader run, Android/iOS device test, load test or security assessment. Private authorization, tenant isolation, durable idempotency and billing attack paths cannot be claimed tested before those capabilities exist.

## Findings corrected during implementation

1. Express sees the internal HTTP bridge connection. Origin comparison now uses the original Worker Request URL, before the bridge. The matching origin passes; cross-origin/opaque requests fail. This is supplementary browser protection, not authentication or a bot defense.
2. CSP blocked hydration when its nonce was not applied to Router SSR options. The browser exposed a blank-page crash missed by build/types. Request-scoped nonce propagation and the production HTTP regression now cover this case.
3. A selector was accidentally broadened while adding fieldset styling. The final visual inspection caught it; the scoped review label and normal field labels were restored and rebuilt.
4. TypeScript 7 exceeded the lint parser's supported peer range. TypeScript 6.0.3 is pinned instead, without peer overrides.
5. API module HMR could leave the Node bridge listener bound, and module-dispose cleanup did not resolve the runtime behavior. Development now uses Wrangler-owned API isolate restarts plus Vite frontend refresh; production/preview retains the auxiliary Worker build. Two real edit/reload cycles are a blocking regression check. Brief unavailability during development reload is expected; user retry state remains explicit.
6. The document's current date exceeded one bundled runtime's supported compatibility date. Both Workers pin the supported 2026-10-23 date; date changes require runtime verification.

## Performance and build evidence

Final emitted client totals: **153.22 KiB JS gzip**, **2.66 KiB CSS gzip**. Latin variable font: **36.07 KiB**; Latin Extended subset: approximately **17.79 KiB**, requested only for its Unicode range. These pass the 200/20/40 KiB budgets. No date, animation, HTTP wrapper, UI kit or global-store library was added.

The auxiliary API Worker is approximately 313.66 KiB gzip and the standalone Wrangler dry-run approximately 419.58 KiB gzip; neither is browser code. `vite:css-post` emits an upstream sourcemap diagnostic for the SSR CSS URL transform; builds and runtime checks succeed. This limits confidence in that development CSS mapping, not response correctness; it remains a tooling follow-up rather than a suppressed warning.

No hosted p95 latency, INP/CLS, scale, cold-start, demand, conversion or paid margin claim follows from these local results. [Dependency inventory](../dependencies.md) records versions, licenses, purpose and cost boundaries.

## Evidence and next step

- [Desktop review](evidence/01-desktop-review.png)
- [Mobile review](evidence/02-mobile-review.png)

Next: the Neon/Drizzle and Better Auth slice, with actual tenant/transaction/recovery tests and staging secrets supplied outside Git. Keep the market backlog unchecked until its complete acceptance gates pass. Production routing, auth, R2/scanner, outbox/Queues, Razorpay, AI, independent accessibility/security, restore/load and release operations remain pending. No cloud account was changed, remote repository created, deployment performed or live charge made.
