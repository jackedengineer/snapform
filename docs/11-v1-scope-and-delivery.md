# V1 scope and development contract

**Accepted delivery direction: 28 October 2026.** Audience: small agencies, consultants, coaches and startup teams. The first paid pilots focus on project qualification/discovery. This list was presented before application code began.

## Must-have market V1

1. Verified accounts/workspaces, recovery/MFA, invitations and owner/editor/viewer roles with tenant isolation.
2. Focused segment templates and a bounded builder: core fields, choices/date/acknowledgment, conditional paths, branding, autosave/conflicts, testing and immutable publication.
3. Reliable mobile intake: relevant fields, back navigation, recovery, private checked files, direct editable review and duplicate-safe durable submission.
4. Response inbox/detail, CSV export, minimal email notifications, signed webhooks, payload preflight and visible repair/retry history.
5. Optional bounded AI authoring and guided intake: typed proposals, source evidence, explicit correction/confirmation, approved business facts, cost limits and immediate field fallback.
6. Razorpay subscription lifecycle using the existing account; clear trial/limits, owner billing management, renewal/cancellation, payment-failure handling and reconciliation.
7. Supported first-source import with compatibility/path review and controlled cutover.
8. Retention/deletion, abuse reporting, monitoring, audit, access review, tested backups/restores, accessibility/security/performance evidence and operating ownership.

No generic CRM, form payments, bookings, signatures, voice, offline client, enterprise controls or broad connector catalog in V1. Native file scanning uses a gated Cloudflare workload; if it cannot meet requirements, file release is blocked rather than silently changing platform.

## Order of delivery

- **Slice 0:** recorded scope, platform decision, quality contract and clean local Git baseline/branch.
- **Slice 1:** reproducible pnpm/TypeScript workspace, TanStack Start web application, Express Worker and shared bounded brief validation; details → server check → editable review, with no persistence claim. Tests, build, dependency/bundle check and three-mode browser evidence accompany it.
- **Slice 2:** Neon/Drizzle schema/roles/transaction transport, migrations and actual isolation/rollback tests; Better Auth verified accounts/recovery/MFA. Requires environment credentials in ignored local variables and staging configuration.
- **Slice 3:** deterministic field/rule engine, drafts and publication, anonymous session capabilities and one transactionally durable reviewed response.
- **Slice 4:** outbox/Queues recovery, R2 quarantine/scanning, inbox/export/email/webhooks and preflight.
- **Slice 5:** limited migration, metering, Razorpay billing, retention/deletion and paid operational pilot.
- **Slice 6:** AI authoring, then guided intake on the same contracts, with held-out quality/cost/failure evidence.
- **Slice 7:** paid repeat-use, independent security/accessibility, load/restore/rollback/support and staged launch gates.

The detailed backlog retains stable task IDs. The earlier 32–40 week / 960–1,200 hour estimate remains provisional until the first hosted database/auth/queue slice establishes actual effort; no launch date is promised.

## Test and browser discipline

Write focused failing behavioral tests before implementing logic; use actual workerd integration tests at HTTP/platform boundaries. Test what users and other systems observe, not private method calls. Use real database tests for transactions/tenant boundaries; mocks do not prove these. Provider side effects use test-mode/sandbox fixtures and reconciliation scenarios.

Every feature is exercised in the real browser as normal user, power user and adversarial user, against owned synthetic data. Browser findings become regression tests. Native APIs and lightweight dependencies are preferred; exact versions, licensing and measured bundle cost accompany additions. Failed checks block completion. Record tested states and unresolved gates; no suite proves the app is correct forever.

Current authority: [technical specification](03-technical-foundation.md), [ADR-012](decisions/ADR-012-express-workers-native-first.md), root CONTRIBUTING.md and CONSTRAINTS.md.
