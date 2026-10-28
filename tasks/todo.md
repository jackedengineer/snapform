# V1 implementation backlog

**All work is pending.** This is a plan, not evidence of shipped features. Read the phase estimates and gates in [plan.md](plan.md). Task IDs are stable; T65/T66 were added in the 28 October platform revision, bringing the backlog to 66 items. Paths are proposed; no application files exist yet. Each item is a bounded implementation/review unit; split before starting if it grows beyond ~5 files or one focused session. Effort estimates live at phase level and include integration, defects, polish and contingency.

**Engineering verification convention:** run the focused test named below plus `pnpm lint`, `pnpm typecheck`, and the affected build once scaffold scripts exist. Use actual Postgres/RLS/queue for transaction/isolation cases. Business/document tasks use evidence review rather than artificial code tests. Security/accessibility checks apply whenever those boundaries change.

## P0 — Discovery and feasibility

### [ ] T01 — Record interviews and real intake examples

**Requirements:** FR-04,FR-46. **Dependencies:** None.

- Acceptance: At least three interviews per target segment and eight permissioned briefs are recorded; pain, buyer, destination, sensitive-data exclusions and switching blockers are explicit.
- Verify: Founder reviews consent, denominators and counterexamples.
- Proposed files (small/medium scope): `docs/discovery/interviews.md`, `docs/discovery/workflows.md`.

### [ ] T02 — Validate paid workflow and scope

**Requirements:** FR-04,FR-46. **Dependencies:** T01.

- Acceptance: Three pilots commit to one shared job; V1 scope and exclusion register reflect their actual requirements.
- Verify: Review signed/recorded pilot commitments and a sample end-to-end intake.
- Proposed files (small/medium scope): `docs/discovery/pilots.md`, `docs/scope-baseline.md`.

### [ ] T03 — Resolve merchant, region and first adapter feasibility

**Requirements:** FR-28,FR-37. **Dependencies:** T01.

- Acceptance: Existing Razorpay account Subscription configuration, methods/currency/customer coverage and data geography have evidence; Cloudflare Start + Express Worker and native-scanner feasibility and release-blocking runtime constraints are recorded; authorized source sample maps to the bounded engine.
- Verify: Time-boxed deployment/provider feasibility spike, test mode only and founder decision record. Local Earlier framework runtime failure is recorded evidence; deployed container readiness remains unproven.
- Proposed files (small/medium scope): `docs/decisions/provider-selection.md`, `docs/discovery/import-feasibility.md`.

### [ ] T04 — Test review and readiness design with users

**Requirements:** FR-18,FR-45,FR-46,FR-47. **Dependencies:** T01.

- Acceptance: Five representative users can locate factual review, edit a value and understand delivery state; severe comprehension defects are recorded.
- Verify: Observed usability sessions and design revision review.
- Proposed files (small/medium scope): `docs/design/usability.md`, `design/system.html`.

**Checkpoint:** apply CP0 from the plan; record evidence and unresolved risks before expansion.

## P1 — Foundation

### [ ] T05 — Scaffold reproducible workspace and CI

**Requirements:** NFR-11. **Dependencies:** T02, T03.

- Acceptance: Strict TS TanStack Start applications and shared packages build; TanStack Query/Form/Router and bounded Store state replace prior choices; lockfile, lint/type/test/build scripts, Cloudflare compatibility dates and environment separation are configured.
- Verify: Clean checkout install/build plus deliberate CI failure check.
- Proposed files (small/medium scope): `package.json`, `pnpm-workspace.yaml`, `tsconfig.json`, `.github/workflows/ci.yml`.

### [ ] T06 — Create database roles and tenant repositories

**Requirements:** FR-02,NFR-08. **Dependencies:** T05.

- Acceptance: Migration/app/worker roles are separate; tenant-aware keys and transaction-local context default deny.
- Verify: Real Postgres cross-tenant/pool reuse negative tests.
- Proposed files (small/medium scope): `packages/database/schema.ts`, `packages/database/tenant.ts`, `packages/database/migrations/001-tenants.sql`, `tests/integration/tenant.test.ts`.

### [ ] T07 — Deliver verified signup and recovery

**Requirements:** FR-01. **Dependencies:** T06.

- Acceptance: Better Auth + official Drizzle adapter on Neon supports verified workspace creation, sign-in/reset/logout; enumeration-safe errors and revocation work; cookie/origin behavior survives ingress and SSR.
- Verify: Auth sandbox integration and browser lifecycle test.
- Proposed files (small/medium scope): `apps/web/src/routes/auth.tsx`, `apps/api/modules/identity.ts`, `tests/e2e/auth.spec.ts`.

### [ ] T08 — Deliver invitations and roles

**Requirements:** FR-02. **Dependencies:** T07.

- Acceptance: Expiring invites bind recipient; owner/editor/viewer permissions and last-owner rule work.
- Verify: Role matrix and forwarded/expired invite tests.
- Proposed files (small/medium scope): `apps/api/modules/memberships.ts`, `apps/web/src/routes/settings/members.tsx`, `tests/integration/roles.test.ts`.

### [ ] T09 — Add MFA and privileged reauthentication

**Requirements:** FR-03. **Dependencies:** T07, T08.

- Acceptance: MFA enrollment/recovery documented; enrolled owners and support require step-up for privileged operations.
- Verify: Expired challenge, revocation and recovery scenario review.
- Proposed files (small/medium scope): `apps/api/modules/step-up.ts`, `apps/web/src/routes/settings/security.tsx`, `tests/e2e/security.spec.ts`.

### [ ] T10 — Deploy token-based core controls

**Requirements:** NFR-07. **Dependencies:** T04, T05.

- Acceptance: Button/field/dialog/save-status states use semantic tokens; keyboard/focus/error naming work.
- Verify: Storybook state review, contrast check and axe/manual keyboard.
- Proposed files (small/medium scope): `packages/ui/tokens.css`, `packages/ui/field.tsx`, `packages/ui/dialog.tsx`, `packages/ui/field.stories.tsx`.

### [ ] T11 — Establish sanitized telemetry and recovery baseline

**Requirements:** NFR-06,NFR-10. **Dependencies:** T05, T06.

- Acceptance: Runtime-appropriate Node/Worker logs and request/tenant/event IDs correlate without raw content; Neon restore history and protected R2/file-export backups are configured; external alert path works.
- Verify: Log sampling, alert delivery and initial isolated restore check.
- Proposed files (small/medium scope): `packages/observability/index.ts`, `apps/api/instrumentation.ts`, `docs/runbooks/restore.md`, `docs/runbooks/alerts.md`.

### [ ] T12 — Define bounded form and event contracts

**Requirements:** FR-05,FR-07,FR-09,FR-12. **Dependencies:** T02, T06.

- Acceptance: Stable fields/options/pages/rules and explicit answer states validate; public and private projections are distinct.
- Verify: Invalid/oversized/reference fixtures and schema adapter checks.
- Proposed files (small/medium scope): `packages/contracts/form.ts`, `packages/contracts/events.ts`, `packages/contracts/public.ts`, `packages/contracts/form.test.ts`.

### [ ] T65 — Prove the Cloudflare runtime and Neon/auth boundary

**Requirements:** FR-01,NFR-01,NFR-03,NFR-08,NFR-11. **Dependencies:** T05, T06, T07, T12.

- Acceptance: Synthetic TanStack Start → ingress Worker → Express Worker → Neon transaction slice deploys; auth cookies, tenant context, streaming and R2 signing work; lifecycle/placement/routing/rollout and release-blocking incompatibility decision are recorded.
- Verify: Local Worker tests plus deployed staging idle/warm requests, concurrent tenants, instance replacement, rollback and raw-webhook-body preservation. Local Node control alone does not pass this gate.
- Proposed files (small/medium scope): `apps/api/wrangler.jsonc`, `apps/api/src/worker.ts`, `apps/web/vite.config.ts`, `tests/integration/platform.test.ts`, `docs/runbooks/platform.md`.

### [ ] T66 — Implement durable outbox dispatch and Cloudflare queue recovery

**Requirements:** FR-19,FR-27,NFR-05,NFR-09. **Dependencies:** T06, T12, T65.

- Acceptance: Transactional outbox records, leased Cron relay, queue consumers, DLQ and reconciliation preserve stable identities; no reliance on distributed atomic queue/DB commit or a polling daemon in Workers.
- Verify: Rollback, crash before/after queue ack, lost mark-dispatched, duplicate/out-of-order messages, lease expiry, queue outage/retention and deletion races; tenant context remains transaction-scoped with Hyperdrive cache disabled.
- Proposed files (small/medium scope): `packages/database/outbox.ts`, `apps/worker/relay.ts`, `apps/worker/consumer.ts`, `apps/worker/wrangler.jsonc`, `tests/integration/outbox.test.ts`.

**Checkpoint:** apply CP1 from the plan; record evidence and unresolved risks before expansion.

## P2 — Deterministic intake

### [ ] T13 — Implement normalized value codecs

**Requirements:** FR-05,FR-07. **Dependencies:** T12.

- Acceptance: Text/email/number/choices/date/ack/file codecs preserve zero/false/missing distinctions and declared units.
- Verify: Table-driven codec tests including dates/currencies and boundary lengths.
- Proposed files (small/medium scope): `packages/form-engine/codecs.ts`, `packages/form-engine/codecs.test.ts`.

### [ ] T14 — Implement applicability and forward routing

**Requirements:** FR-09,FR-17. **Dependencies:** T13.

- Acceptance: Upstream changes remove unreachable effective values; rule precedence and applicable requiredness are deterministic.
- Verify: Hidden-required, stale-answer, branch-change and idempotence property tests.
- Proposed files (small/medium scope): `packages/form-engine/evaluate.ts`, `packages/form-engine/evaluate.test.ts`.

### [ ] T15 — Compile and diagnose definitions

**Requirements:** FR-09,FR-10,FR-12. **Dependencies:** T14.

- Acceptance: Cycles/references/type conflicts/size bounds block publish; diagnostics point to stable IDs.
- Verify: Compiler fixture corpus and reproducible invalid graphs.
- Proposed files (small/medium scope): `packages/form-engine/compile.ts`, `packages/form-engine/compile.test.ts`.

### [ ] T16 — Persist idempotent draft operations

**Requirements:** FR-06,FR-08. **Dependencies:** T12, T08.

- Acceptance: CAS revision and operation ID prevent stale overwrite; undo creates new revision.
- Verify: Concurrent writer, retry and invalid operation tests.
- Proposed files (small/medium scope): `apps/api/modules/drafts.ts`, `packages/database/drafts.ts`, `tests/integration/drafts.test.ts`.

### [ ] T17 — Deliver outline and inspector editing

**Requirements:** FR-04,FR-06. **Dependencies:** T10, T16.

- Acceptance: Create/edit/duplicate fields/pages and keyboard reorder work; dependency warnings are shown.
- Verify: Browser draft editing plus keyboard reorder; no unrelated field changes.
- Proposed files (small/medium scope): `apps/web/features/builder/outline.tsx`, `apps/web/features/builder/inspector.tsx`, `tests/e2e/builder.spec.ts`.

### [ ] T18 — Expose save conflicts and pending recovery

**Requirements:** FR-08. **Dependencies:** T17.

- Acceptance: Saving/Saved/Offline/Conflict/Failed states match server; local operations survive refresh and clear at logout.
- Verify: Disconnect/reload/stale-tab browser tests.
- Proposed files (small/medium scope): `apps/web/features/builder/use-draft.ts`, `apps/web/features/builder/save-status.tsx`, `tests/e2e/draft-recovery.spec.ts`.

### [ ] T19 — Publish immutable versions and manifests

**Requirements:** FR-12,FR-13. **Dependencies:** T15, T16.

- Acceptance: Exact validated revision atomically becomes live; old sessions retain versions and failed assets leave prior publication.
- Verify: Concurrent publish/stale hash/rollback transaction tests.
- Proposed files (small/medium scope): `apps/api/modules/publishing.ts`, `packages/database/versions.ts`, `tests/integration/publish.test.ts`.

### [ ] T20 — Create scoped collector sessions and slot reservations

**Requirements:** FR-15,FR-38,FR-39. **Dependencies:** T19, T06.

- Acceptance: Session pins live version and bounded capability; atomic quota reservation limits parallel starts.
- Verify: Capability expiry, unauthorized access and concurrent quota tests.
- Proposed files (small/medium scope): `apps/api/modules/sessions.ts`, `packages/metering/reservations.ts`, `tests/integration/sessions.test.ts`.

### [ ] T21 — Render text, email and number fields

**Requirements:** FR-05,FR-07,FR-16. **Dependencies:** T13, T20, T10.

- Acceptance: Page/card input supports labels/errors/unit/keyboard/IME; server answers save with revision checks.
- Verify: Cross-runtime value fixture and mobile/IME browser test.
- Proposed files (small/medium scope): `packages/form-ui/text.tsx`, `packages/form-ui/number.tsx`, `apps/collector/answer-state.ts`, `tests/e2e/collector-inputs.spec.ts`.

### [ ] T22 — Render choices, date and acknowledgment

**Requirements:** FR-05,FR-07,FR-17. **Dependencies:** T21.

- Acceptance: Choice IDs survive labels; date and acknowledgment are accessible and normalize consistently.
- Verify: Choice correction, date-boundary, checkbox-false browser/engine tests.
- Proposed files (small/medium scope): `packages/form-ui/choice.tsx`, `packages/form-ui/date.tsx`, `packages/form-ui/acknowledgment.tsx`, `tests/e2e/collector-types.spec.ts`.

### [ ] T23 — Deliver final review and direct field editing

**Requirements:** FR-18. **Dependencies:** T21, T22, T14.

- Acceptance: Effective answers are reviewable/editable; revision/hash invalidates stale confirmations.
- Verify: Change upstream answers and review/submit stale revision tests.
- Proposed files (small/medium scope): `apps/collector/review.tsx`, `apps/collector/review-state.ts`, `tests/e2e/review.spec.ts`.

### [ ] T24 — Commit response, event, usage and outbox atomically

**Requirements:** FR-19,FR-38,NFR-05. **Dependencies:** T23, T20, T66.

- Acceptance: One response/session; response/event/usage/outbox commit together; no queue network call inside the DB transaction; idempotency conflicts are explicit.
- Verify: Crash before/after DB commit/queue publish/response ack; rollback leaves no outbox or usage; committed outbox survives missed/duplicate dispatch.
- Proposed files (small/medium scope): `apps/api/modules/submit.ts`, `packages/database/submission.ts`, `packages/database/outbox.ts`, `tests/integration/durability.test.ts`.

### [ ] T25 — Handle completion, pause, revocation and recovery

**Requirements:** FR-13,FR-16,FR-20. **Dependencies:** T24, T19.

- Acceptance: Success requires durable reference; routine pause/grace and emergency revoke differ visibly; refresh retains permitted progress.
- Verify: Mobile offline/reload/double-submit/expired/revoked sessions.
- Proposed files (small/medium scope): `apps/collector/completion.tsx`, `apps/api/modules/session-policy.ts`, `tests/e2e/recovery.spec.ts`.

### [ ] T26 — Deliver rule testing and intake-readiness checks

**Requirements:** FR-10,FR-46. **Dependencies:** T15, T17, T24.

- Acceptance: Saved example inputs show expected/actual routing/effective output; template readiness flags explicit missing business context.
- Verify: At least 100 engine path fixtures, preview/server parity and usability check.
- Proposed files (small/medium scope): `apps/web/features/logic/test-panel.tsx`, `packages/form-engine/trace.ts`, `tests/fixtures/paths.json`, `tests/integration/parity.test.ts`.

**Checkpoint:** apply CP2 from the plan; record evidence and unresolved risks before expansion.

## P3 — Usable handoff

### [ ] T27 — Implement file quarantine and private upload

**Requirements:** FR-21. **Dependencies:** T20, T11.

- Acceptance: Private R2 upload/quarantine uses expiring scoped capabilities, server-side byte/type/count checks and tenant/session binding; CORS and multipart completion checks work. R2 is the selected object store; separate-account protected copies support recovery.
- Verify: Spoofed file, excessive bytes and cross-tenant upload tests.
- Proposed files (small/medium scope): `apps/api/modules/uploads.ts`, `packages/database/uploads.ts`, `tests/integration/uploads.test.ts`.

### [ ] T28 — Scan files and authorize download

**Requirements:** FR-21,FR-22. **Dependencies:** T27, T24.

- Acceptance: Isolated ClamAV container on Cloudflare, on the selected Cloudflare platform, marks clean/rejected/pending; scan hash/object identity, expiring downloads and required-file policy work. No ClamAV process is assumed inside an ordinary Worker.
- Verify: Scanner outage, malware fixture, deleted response and link expiry tests.
- Proposed files (small/medium scope): `apps/worker/jobs/scan.ts`, `apps/api/modules/downloads.ts`, `packages/form-ui/file.tsx`, `tests/integration/files.test.ts`.

### [ ] T29 — Deliver branded sharing and embed

**Requirements:** FR-11,FR-14. **Dependencies:** T19, T21.

- Acceptance: Logo/accent contrast validation and hosted link work; iframe messages validate origins and sizing.
- Verify: 320px preview, contrast tests, blocked third-party-cookie and message spoof tests.
- Proposed files (small/medium scope): `apps/web/features/share/index.tsx`, `apps/collector/embed.ts`, `packages/ui/theme-policy.ts`, `tests/e2e/embed.spec.ts`.

### [ ] T30 — Deliver response inbox and detail

**Requirements:** FR-23. **Dependencies:** T24, T08, T28.

- Acceptance: Cursor filters/search/detail show original/confirmed data, files and labeled notes; viewer role is enforced.
- Verify: Tenant pagination/filter and note-evidence immutability tests.
- Proposed files (small/medium scope): `apps/api/modules/responses.ts`, `apps/web/features/responses/inbox.tsx`, `apps/web/features/responses/detail.tsx`, `tests/integration/responses.test.ts`.

### [ ] T31 — Deliver bounded safe CSV exports

**Requirements:** FR-24. **Dependencies:** T30.

- Acceptance: Async exports use versioned labels/IDs and safe cell values; download and expiry respect role/deletion.
- Verify: Formula-leading fixtures, large export and tenant/role/deletion tests.
- Proposed files (small/medium scope): `apps/worker/jobs/export.ts`, `apps/api/modules/exports.ts`, `tests/integration/exports.test.ts`.

### [ ] T32 — Create destination config and mapping versions

**Requirements:** FR-26,FR-27. **Dependencies:** T24, T08.

- Acceptance: Verified recipients/HTTPS destinations bind tenant; immutable mapping and credential rotation are recorded.
- Verify: SSRF URL/DNS/redirect cases, recipient and secret exposure tests.
- Proposed files (small/medium scope): `apps/api/modules/connections.ts`, `packages/integrations/egress.ts`, `tests/integration/connections.test.ts`.

### [ ] T33 — Deliver internal email notifications

**Requirements:** FR-25. **Dependencies:** T32, T24.

- Acceptance: Minimal notification links to authenticated record; send ledger, idempotency and suppression work.
- Verify: Provider sandbox duplicate/timeout/bounce and expired-key-window scenarios.
- Proposed files (small/medium scope): `packages/integrations/email.ts`, `apps/worker/jobs/email.ts`, `tests/integration/email.test.ts`.

### [ ] T34 — Deliver signed webhook retries

**Requirements:** FR-26,FR-27. **Dependencies:** T32, T24.

- Acceptance: Stable signed event/body, bounded retries/Retry-After and permanent-error pause work; Unknown is distinct.
- Verify: Local receiver tests for 429/timeout/ack-loss/duplicates and signature rotation.
- Proposed files (small/medium scope): `packages/integrations/webhook.ts`, `apps/worker/jobs/delivery.ts`, `tests/integration/webhooks.test.ts`.

### [ ] T35 — Expose delivery history and safe replay

**Requirements:** FR-27. **Dependencies:** T33, T34, T30.

- Acceptance: Operator sees destination/attempts/next retry; replay cannot mutate original response or blindly duplicate uncertain actions.
- Verify: Browser repair scenario and durable audit/idempotency verification.
- Proposed files (small/medium scope): `apps/api/modules/delivery-retry.ts`, `apps/web/features/deliveries/detail.tsx`, `tests/e2e/delivery-repair.spec.ts`.

### [ ] T36 — Add payload preview and delivery preflight

**Requirements:** FR-47. **Dependencies:** T26, T33, T34, T29.

- Acceptance: Test data previews exact effective payload; labeled test event/receipt invalidates after config change and never bills.
- Verify: Sandbox receiver compares displayed/sent payload and billing ledger stays unchanged.
- Proposed files (small/medium scope): `apps/api/modules/preflight.ts`, `apps/web/features/share/preflight.tsx`, `tests/integration/preflight.test.ts`.

### [ ] T37 — Deliver four segment templates and cloning

**Requirements:** FR-04,FR-46. **Dependencies:** T17, T26, T36.

- Acceptance: Agency, consultant, coach and startup templates use supported rules with clear purpose; clones have new identities.
- Verify: Compile all templates and observe first-publish/first-delivery journey.
- Proposed files (small/medium scope): `packages/contracts/templates.ts`, `apps/web/features/onboarding/templates.tsx`, `tests/e2e/templates.spec.ts`.

### [ ] T38 — Deliver first-party funnel metrics

**Requirements:** FR-29. **Dependencies:** T24, T30.

- Acceptance: Eligible starts/real submissions/delivery/time and inferred abandonment have defined denominators; no raw content in events.
- Verify: Reconcile synthetic sessions and replay/test/bot exclusions against SQL totals.
- Proposed files (small/medium scope): `apps/api/modules/metrics.ts`, `apps/web/features/analytics/form.tsx`, `tests/integration/analytics.test.ts`.

**Checkpoint:** apply CP3 from the plan; record evidence and unresolved risks before expansion.

## P4 — Migration and commerce

### [ ] T39 — Parse first authorized source adapter

**Requirements:** FR-28. **Dependencies:** T03, T12, T15.

- Acceptance: Supported Typeform fields/options map to stable source IDs; unsupported constructs produce explicit issues.
- Verify: Consented/redacted source fixtures including unsupported payments/rules.
- Proposed files (small/medium scope): `packages/integrations/typeform-import.ts`, `packages/contracts/import-report.ts`, `tests/fixtures/imports.json`, `tests/integration/import.test.ts`.

### [ ] T40 — Deliver import review and cutover

**Requirements:** FR-28. **Dependencies:** T39, T26, T36.

- Acceptance: Imported draft shows compatibility/path comparison; cutover plan retains incumbent return path.
- Verify: Pilot owner verifies representative paths and destination test before link switch.
- Proposed files (small/medium scope): `apps/web/features/import/review.tsx`, `docs/runbooks/cutover.md`, `tests/e2e/import-review.spec.ts`.

### [ ] T41 — Implement usage ledger and entitlement projection

**Requirements:** FR-36,FR-38,FR-39. **Dependencies:** T24, T20.

- Acceptance: Response/AI/file/seat counters and reservations reconcile; limits are derived from versioned plan policy.
- Verify: Parallel reservation, duplicate ledger, period rollover and abandoned session tests.
- Proposed files (small/medium scope): `packages/metering/ledger.ts`, `packages/metering/policy.ts`, `tests/integration/metering.test.ts`.

### [ ] T42 — Implement billing event ingestion

**Requirements:** FR-37. **Dependencies:** T03, T41.

- Acceptance: Razorpay raw-body HMAC verification and x-razorpay-event-id/business-resource dedupe feed monotonic subscription projection; reconciliation repairs missing/out-of-order events and uncertain subscription creation.
- Verify: Razorpay test-mode lifecycle with reordered/duplicate/missing events and webhook secret rotation.
- Proposed files (small/medium scope): `apps/api/modules/billing-webhook.ts`, `apps/worker/jobs/billing-reconcile.ts`, `tests/integration/billing-events.test.ts`.

### [ ] T43 — Deliver Razorpay checkout, billing management, limits and cancellation

**Requirements:** FR-36,FR-37,FR-39,FR-40. **Dependencies:** T42, T41, T08.

- Acceptance: Razorpay Standard Checkout for Subscriptions and Snapform owner billing UI disclose trial/charge currency/limits/renewal; receipts as available, cancellation/dunning/grace follow verified provider behavior and the stated data policy. No hosted Stripe-style portal assumption.
- Verify: Razorpay test-mode checkout/authorization/renewal/cancel/failed-payment/limit/reset tests; confirm enabled methods and actual account currency/customer coverage.
- Proposed files (small/medium scope): `apps/web/features/billing/page.tsx`, `apps/api/modules/billing.ts`, `apps/collector/limit-state.tsx`, `tests/e2e/billing.spec.ts`.

### [ ] T44 — Deliver retention and deletion jobs

**Requirements:** FR-41,FR-42. **Dependencies:** T28, T31, T35, T41.

- Acceptance: Active purge covers responses/files/exports/derived jobs; tombstones prevent resend and restore resurrection.
- Verify: Representative deletion drill including queued delivery, signed links and restored backup.
- Proposed files (small/medium scope): `apps/worker/jobs/retention.ts`, `apps/api/modules/deletion.ts`, `packages/database/deletion.ts`, `tests/integration/deletion.test.ts`.

### [ ] T45 — Establish scoped support and data-request workflow

**Requirements:** FR-42,FR-44. **Dependencies:** T08, T44, T11.

- Acceptance: Support content access is case-authorized/time-bound/audited; data requester identity is verified by collecting business.
- Verify: Runbook/tabletop and expired support grant negative test.
- Proposed files (small/medium scope): `apps/api/modules/support-grants.ts`, `docs/runbooks/data-requests.md`, `docs/runbooks/support.md`, `tests/integration/support.test.ts`.

### [ ] T46 — Add abuse reporting and capacity isolation

**Requirements:** FR-43,NFR-12. **Dependencies:** T20, T41, T32.

- Acceptance: Per-tenant/form/IP caps and server-verified challenge protect global capacity; abuse report has responder and emergency stop.
- Verify: Flood one tenant while another submits; challenge spoof/replay and origin-bypass checks.
- Proposed files (small/medium scope): `apps/api/plugins/abuse.ts`, `apps/collector/challenge.tsx`, `docs/runbooks/abuse.md`, `tests/integration/abuse.test.ts`.

**Checkpoint:** apply CP4 from the plan; record evidence and unresolved risks before expansion.

## P5 — AI authoring

### [ ] T47 — Build AI adapter and eval baseline

**Requirements:** FR-30,FR-34,FR-35. **Dependencies:** T12, T41, T11.

- Acceptance: Model/prompt/schema/rate versions and refusals/timeouts are tracked; no secret/excluded field enters prompt.
- Verify: Held-out harness baseline and prompt/log snapshot audit.
- Proposed files (small/medium scope): `packages/ai/provider.ts`, `packages/ai/policy.ts`, `packages/ai/evals/runner.ts`, `packages/ai/provider.test.ts`.

### [ ] T48 — Generate bounded draft proposals

**Requirements:** FR-30. **Dependencies:** T47, T15, T16.

- Acceptance: Supported brief produces typed operations/base revision; max one repair and compiler rejection enforced.
- Verify: 100-brief benchmark with unsupported/reference/locale cases.
- Proposed files (small/medium scope): `apps/api/modules/ai-authoring.ts`, `packages/ai/authoring.ts`, `packages/ai/evals/authoring.json`, `tests/integration/ai-authoring.test.ts`.

### [ ] T49 — Deliver proposal diff, apply and undo

**Requirements:** FR-30. **Dependencies:** T48, T18.

- Acceptance: Creator sees changed fields/dependencies; stale proposal never overwrites draft; approved apply and undo create revisions.
- Verify: Concurrent manual/AI edit browser test and compiler fixture check.
- Proposed files (small/medium scope): `apps/web/features/ai/proposal.tsx`, `apps/api/modules/proposal-apply.ts`, `tests/e2e/ai-proposal.spec.ts`.

### [ ] T50 — Separate factual profile approval from tone

**Requirements:** FR-45. **Dependencies:** T49.

- Acceptance: Unprovided factual claims are explicit and blocked from published knowledge until approved; approver/source/version recorded.
- Verify: Synthetic company-name generation and unsupported policy publication tests.
- Proposed files (small/medium scope): `packages/ai/fact-policy.ts`, `apps/web/features/ai/fact-review.tsx`, `tests/integration/fact-approval.test.ts`.

### [ ] T51 — Add authoring limits and model rollout gate

**Requirements:** FR-35,FR-38. **Dependencies:** T48, T41, T50.

- Acceptance: Authoring spend/fair use is visible/capped; reviewed model configuration rolls out by flag with fallback/kill switch.
- Verify: Concurrent spend and failed evaluation prevent rollout; canary rehearsal.
- Proposed files (small/medium scope): `packages/ai/rollout.ts`, `packages/metering/ai-authoring.ts`, `docs/runbooks/model-release.md`, `tests/integration/ai-rollout.test.ts`.

**Checkpoint:** apply CP5 from the plan; record evidence and unresolved risks before expansion.

## P6 — Guided intake

### [ ] T52 — Publish approved pasted knowledge

**Requirements:** FR-33,FR-45. **Dependencies:** T50, T19.

- Acceptance: Bounded text has source entries and immutable approval; active sessions pin version and deletion covers derivations.
- Verify: Contradictory/unapproved/deleted knowledge and version pinning tests.
- Proposed files (small/medium scope): `apps/api/modules/knowledge.ts`, `apps/web/features/knowledge/editor.tsx`, `tests/integration/knowledge.test.ts`.

### [ ] T53 — Implement turn lease, dedupe and spend reservation

**Requirements:** FR-31,FR-38. **Dependencies:** T47, T20, T41.

- Acceptance: One accepted turn/client ID with fencing; API call outside transaction; budget reserved before call and reconciled.
- Verify: Lease expiry, stale completion, provider timeout and concurrent cap tests.
- Proposed files (small/medium scope): `apps/api/modules/turns.ts`, `packages/ai/turn-state.ts`, `tests/integration/turn-concurrency.test.ts`.

### [ ] T54 — Extract evidence-linked candidates and corrections

**Requirements:** FR-32. **Dependencies:** T53, T14.

- Acceptance: Only allowed fields become candidates; ambiguity remains explicit and dependent state recomputes on correction.
- Verify: 300-case labeled extraction/correction evaluation by field/cohort.
- Proposed files (small/medium scope): `packages/ai/extraction.ts`, `packages/ai/evals/extraction.json`, `tests/integration/candidates.test.ts`.

### [ ] T55 — Answer only approved supported FAQs

**Requirements:** FR-33,FR-34. **Dependencies:** T52, T53.

- Acceptance: Answers reference approved entry; unsupported claims abstain and injection cannot alter authority.
- Verify: 100-question held-out supported/unsupported/adversarial corpus; coverage and critical errors reported.
- Proposed files (small/medium scope): `packages/ai/knowledge-answer.ts`, `packages/ai/evals/knowledge.json`, `tests/integration/grounding.test.ts`.

### [ ] T56 — Deliver guided UI and ordinary-field fallback

**Requirements:** FR-31,FR-32,FR-34. **Dependencies:** T54, T55, T23.

- Acceptance: Optional chat shares confirmed state and pinned version; direct edit/fallback always available and critical confirmation required.
- Verify: Mobile/keyboard/screen-reader, provider outage, turn limit and mode-switch tests.
- Proposed files (small/medium scope): `apps/collector/guided.tsx`, `apps/collector/candidate-review.tsx`, `tests/e2e/guided.spec.ts`.

### [ ] T57 — Prove guided review, consent and hard budgets

**Requirements:** FR-18,FR-31,FR-34,FR-35. **Dependencies:** T56, T51, T44.

- Acceptance: No unconfirmed critical value commits; per-field opt-out and kill switch work; limits preserve deterministic completion.
- Verify: Full AI release gate plus cost reconciliation and deleted-data replay tests.
- Proposed files (small/medium scope): `packages/ai/evals/report.ts`, `tests/e2e/guided-trust.spec.ts`, `docs/evidence/ai-release.md`.

**Checkpoint:** apply CP6 from the plan; record evidence and unresolved risks before expansion.

## P7 — Launch

### [ ] T58 — Run paid pilot and outcome comparison

**Requirements:** FR-46. **Dependencies:** T37, T40, T43, T57.

- Acceptance: Five paid pilots target and repeated four-week usage recorded; standard/guided completeness, corrections, time/cost and losses analyzed.
- Verify: Review cohort denominator, consent and genuine records; no unsupported uplift claim.
- Proposed files (small/medium scope): `docs/discovery/paid-pilot.md`, `docs/discovery/outcomes.md`.

### [ ] T59 — Complete independent security and privacy review

**Requirements:** NFR-08,NFR-10. **Dependencies:** T45, T46, T57.

- Acceptance: Scoped app/tenant/SSRF/XSS/AI/billing/file review has no unresolved critical/high finding; privacy notices match data flow.
- Verify: Independent report plus regression checks for validated fixes.
- Proposed files (small/medium scope): `docs/evidence/security-review.md`, `docs/privacy/data-map.md`, `docs/runbooks/incident.md`.

### [ ] T60 — Complete accessibility and device review

**Requirements:** NFR-02,NFR-07. **Dependencies:** T29, T56, T43.

- Acceptance: Core creator/respondent journeys pass manual assistive technology and responsive tests; severe usability defects fixed.
- Verify: VoiceOver/Safari, NVDA/Chrome, keyboard/IME and 320–1440px evidence.
- Proposed files (small/medium scope): `tests/e2e/accessibility.spec.ts`, `docs/evidence/accessibility.md`, `docs/evidence/devices.md`.

### [ ] T61 — Prove load, noisy-neighbor and recovery targets

**Requirements:** NFR-01,NFR-03,NFR-04,NFR-05,NFR-06,NFR-09,NFR-12. **Dependencies:** T24, T35, T44, T57.

- Acceptance: Declared load/latency/error budgets measured; timed DB+file restore and deletion reapplication meet targets.
- Verify: k6 sustained/burst tests, worker/API failure injection and timed isolated restore.
- Proposed files (small/medium scope): `tests/load/collection.js`, `tests/load/noisy-neighbor.js`, `docs/evidence/load.md`, `docs/evidence/restore.md`.

### [ ] T62 — Finish legal, trust, pricing and help materials

**Requirements:** FR-36,FR-40,FR-41,FR-43,FR-44. **Dependencies:** T03, T43, T45, T59.

- Acceptance: Entity/accountant/counsel review matches actual offer; help covers setup/migration/AI/delivery/limits/cancel/abuse and support coverage.
- Verify: Commercial review, invoice/refund sandbox, content/link accuracy and named backup responder.
- Proposed files (small/medium scope): `docs/launch/commercial.md`, `docs/launch/trust.md`, `docs/launch/help.md`, `docs/launch/coverage.md`.

### [ ] T63 — Rehearse deployment and incident rollback

**Requirements:** NFR-01,NFR-06,NFR-11. **Dependencies:** T11, T61, T59.

- Acceptance: Expand/contract deploy, app rollback, feature kill switch and destination reconciliation are rehearsed; alerts route to owner/backup.
- Verify: Staging release/rollback tabletop with times and data reconciliation.
- Proposed files (small/medium scope): `.github/workflows/release.yml`, `docs/runbooks/deploy.md`, `docs/evidence/launch-rehearsal.md`.

### [ ] T64 — Record go/no-go and staged market release

**Requirements:** All P0. **Dependencies:** T58, T59, T60, T61, T62, T63.

- Acceptance: Requirement/evidence ledger has no missing launch blocker; founder authorizes invited cohort then wider public access after observation.
- Verify: Review signed gate checklist, 14-day soak, support readiness and actual rollback path.
- Proposed files (small/medium scope): `docs/launch/go-no-go.md`, `docs/launch/release-notes.md`.

**Checkpoint:** apply CP7 from the plan; record evidence and unresolved risks before expansion.

## Coverage index

- FR-01: T07
- FR-02: T06, T08
- FR-03: T09
- FR-04: T01, T02, T17, T37
- FR-05: T12, T13, T21, T22
- FR-06: T16, T17
- FR-07: T12, T13, T21, T22
- FR-08: T16, T18
- FR-09: T12, T14, T15
- FR-10: T15, T26
- FR-11: T29
- FR-12: T12, T15, T19
- FR-13: T19, T25
- FR-14: T29
- FR-15: T20
- FR-16: T21, T25
- FR-17: T14, T22
- FR-18: T04, T23, T57
- FR-19: T24
- FR-20: T25
- FR-21: T27, T28
- FR-22: T28
- FR-23: T30
- FR-24: T31
- FR-25: T33
- FR-26: T32, T34
- FR-27: T32, T34, T35
- FR-28: T03, T39, T40
- FR-29: T38
- FR-30: T47, T48, T49
- FR-31: T53, T56, T57
- FR-32: T54, T56
- FR-33: T52, T55
- FR-34: T47, T55, T56, T57
- FR-35: T47, T51, T57
- FR-36: T41, T43, T62
- FR-37: T03, T42, T43
- FR-38: T20, T24, T41, T51, T53
- FR-39: T20, T41, T43
- FR-40: T43, T62
- FR-41: T44, T62
- FR-42: T44, T45
- FR-43: T46, T62
- FR-44: T45, T62
- FR-45: T04, T50, T52
- FR-46: T01, T02, T04, T26, T37, T58
- FR-47: T04, T36

Optional native connector work is not in this baseline. If the three-pilot demand gate is met, add adapter-specific configuration, delivery/reconciliation, authorization and failure-test tasks and re-estimate by 40–80 hours. Deferred roadmap features need separate specs.
