# Functional requirements and release acceptance

**Status:** Proposed V1 contract; platform/billing alignment updated 28 October 2026. All requirements are pending implementation. **Priority:** P0 = required for market V1; P1 = gated extension or later release. Requirements map to backlog tasks in `tasks/todo.md`.

## 1. Capability boundaries

| Stable module ID | Owns | Depends on |
|---|---|---|
| identity | Identity verification, workspace membership, roles, sessions | Better Auth + Neon identity store |
| forms | Draft operations, fields, themes, immutable versions, publish compiler | identity; pure contracts/engine |
| collection | Public manifest, sessions, answers, review, durable response | forms; pure engine |
| files | Private assets, quarantine, authorized retrieval, deletion | identity; collection/form references |
| delivery | Connections, mapping versions, attempts, email/webhook | collection events; identity |
| ai-assistance | Draft proposals, turns, knowledge versions, budgets | forms; collection; metering policy |
| commerce | Subscription state, Razorpay checkout, owner billing management, entitlements | identity; usage ledger |
| operations | Audit, product metrics, recovery, support workflows | Events from all modules |

Shared contracts, the pure form engine, and the usage ledger are lower-level packages. Modules use narrow interfaces and events; the collection transaction records delivery intent without calling the delivery module's external APIs. Commerce publishes an entitlement projection read by policy checks. This avoids a commerce↔collection dependency cycle.

## 2. Roles and authorization

| Action | Owner | Editor | Viewer | Public respondent |
|---|---|---|---|---|
| Read published form | Yes | Yes | Yes | Yes when live |
| Edit/test/publish/pause/rollback | Yes | Yes | No | No |
| Read responses and files | Yes | Yes | Yes | Only own scoped session, never workspace results |
| Export responses | Yes | Yes | No | No |
| Configure/replay destinations | Yes | Yes | No | No |
| Billing, invites, retention, delete workspace | Yes | No | No | No |
| Submit answers | Preview or public mode | Preview or public mode | Public mode | Own session only |

Viewer is intentionally allowed sensitive intake access; label this in the invite UI. No invitation is inferred from knowing an email address. Customer workspaces remain separate; an agency cannot treat an internal workspace as a secure client portal. Dedicated client-facing access is later scope.

## 3. Identity and workspace — P0

**FR-01 — Account lifecycle.** Verified email/password sign-in, password reset, optional Google sign-in, sign-out, session revocation, and workspace creation. Accept: unverified accounts cannot publish; reset responses resist email enumeration; revoked/removed users lose access on the next authorized request. Google login may follow email login within V1, but must not block the core journey.

**FR-02 — Membership.** Owner sends expiring single-use invites; owner/editor/viewer roles are enforced server-side and in workers. Accept: forwarding an invite cannot join as another identity; last owner cannot be removed without transferring ownership or deleting workspace; negative tests cover every resource family.

**FR-03 — Security controls.** TOTP MFA available; required for founder/support privileged access and owner billing/destructive actions after enrollment. Accept: recent reauthentication protects owner transfer, workspace deletion and secret reveal/rotation; role changes and support access generate audit events. Do not require MFA of anonymous respondents.

## 4. Authoring and publication — P0

**FR-04 — Starting points.** Create blank, use four segment templates, duplicate existing form, paste brief for AI draft, or import supported source. Accept: duplication produces new form/field identities and preserves structure; templates contain realistic segment wording, privacy placeholders that must be completed, and no clinical screening prompts.

**FR-05 — Field registry.** Support short text (≤500 characters), long text (≤10,000), email, number, single choice, multiple choice, ISO local date, acknowledgment checkbox, and uploaded-file reference. Headings/help text are content blocks. Accept: every type has editor, accessible respondent UI, codec, server validator, CSV representation and AI eligibility policy; IDs survive label/option renames. V1 number values have explicit unit/currency metadata where relevant; ambiguous model output cannot supply an undeclared currency.

**FR-06 — Structure.** Add/reorder/duplicate/delete fields; arrange sections/pages; select page or card presentation. Accept: destructive changes show affected rules/mappings; drag reordering has keyboard buttons; mobile preview uses actual collector components. Deleting an option does not reinterpret historical option IDs.

**FR-07 — Field constraints.** Required/applicable flags, safe min/max number bounds, choice limits, text lengths, bounded dates and helpful descriptions. Accept: server rejects invalid values independently; missing ≠ zero/false/blank/refused/not-applicable; labels and descriptions render as text or a small sanitized markup subset. Arbitrary regex and JavaScript are excluded.

**FR-08 — Draft save/recovery.** Debounced saves use expected revision and operation ID; show Saving, Saved, Offline changes, Conflict, or Failed. Accept: refresh/network failure recovers acknowledged changes; conflict never silently overwrites a newer draft; AI/manual writes share revision rules; undo applies a new revision. Local pending buffers clear after logout and do not become a permanent sensitive-data cache.

**FR-09 — Deterministic rules.** Conditions support typed equality/inequality, number/date comparisons, choice membership, answered/unanswered, bounded AND/OR/NOT; actions support applicability, forward navigation and ending selection. Accept: publish rejects cycles, missing references, illegal type comparisons, and ambiguous priority; upstream edits remove unreachable answers from effective data and external payloads. No formulas, hidden private qualification score, or model-decided routing in V1.

**FR-10 — Logic inspection.** A rule list and executable test panel explain matched conditions and next page. Accept: at least one default path and each authored branch can be exercised with saved example inputs; errors link to fields/rules; preview/server results agree. A graphical drag-and-drop workflow editor is deferred.

**FR-11 — Branding.** Logo, accessible accent color, bounded font choice, light background preset and welcome/ending copy. Accept: contrast checker rejects unreadable combinations; no raw customer CSS/HTML; logos are safe image types with alt-text handling; layout remains usable at 320px and 200% zoom. Customer form themes are separate from the authoring shell.

**FR-12 — Publish.** Validate a specific revision, display blocking issues, explicitly publish, create immutable snapshot and switch live pointer atomically. Accept: stale validation cannot publish changed content; active sessions stay pinned to their version; failed asset preparation leaves old version live. Published versions include contract/engine/theme/knowledge/AI policy/mapping references and hash.

**FR-13 — Pause and rollback.** Owner/editor can stop new sessions and choose an earlier version. Accept: ordinary pause lets already-started sessions complete during their allowed window and says so; emergency revoke stops affected sessions immediately with an explanation; rollback never rewrites existing responses. Submission rechecks emergency revocation.

**FR-14 — Sharing.** Hosted link and inline iframe embed with documented resize/completion messages. Accept: validate postMessage origin and payload, sanitize height bounds, allowlist embed origins where configured, use accessible iframe title; third-party cookie blocking does not prevent public completion. Popup/lightbox embeds and custom domains are later scope.

## 5. Respondent collection — P0

**FR-15 — Session and notice.** Create a bounded, high-entropy capability scoped to form/session/version; explain purpose, business identity, privacy URL, saved progress and optional AI before collection. Accept: no creator token in public data; no raw answers/capabilities in logs or referrers; default same-browser recovery expires after 7 days, with a visible clear-progress action. No emailed resume link in V1.

**FR-16 — Answer state.** Save server-side after meaningful input with a visible status; validate on blur/next and authoritatively on submit. Accept: interrupted saves retry using stable request identity; stale revisions do not erase later values; server persistence of incomplete answers is disclosed. Partial sessions are not exposed as sales leads and do not trigger customer delivery before explicit submission.

**FR-17 — Navigation.** Back/next follows the same deterministic engine; preserve still-applicable confirmed values when switching presentation. Accept: hidden required fields cannot block submission; stale hidden values cannot be exported; focus moves predictably; IME composition does not trigger submit/advance.

**FR-18 — Final review.** Show effective fields, missing/ambiguous items and original versus AI-proposed values; edit directly, then explicitly submit reviewed revision. Accept: critical budget, currency, date and contact values inferred by AI require confirmation; earlier confirmation is invalidated when the candidate changes; completion prose from AI cannot submit a response.

**FR-19 — Durable submission.** Response, submission event, destination delivery intent and billable response event commit together. Accept: double-click, client retry and post-commit timeout return the same response ID; mismatched idempotency payload returns conflict; response remains available if worker/email/model is unavailable. Success UI appears only after durable acknowledgment.

**FR-20 — Completion/error UX.** Show durable reference and configured ending; expired, paused, revoked, quota or connectivity failures offer clear next steps. Accept: errors do not falsely report a successful submission, leak sensitive values or erase unsent answers. Any recovery persistence is bounded and explained.

## 6. Private files — P0

**FR-21 — Upload lifecycle.** Initially PDF, JPEG and PNG; ≤10MB/file, ≤3 files/session, plus workspace storage caps. Private quarantine → type/signature validation → malware scan → clean/rejected; no archives, SVG, executables, Office macros or automatic AI reading. Accept: clean files only become downloadable; required attachments must scan clean before submission; optional pending attachments may allow submission with a visible pending status, but no file delivery occurs until clean. Rejected required attachments need replacement before submission; rejected optional attachments flag the saved response for operator review. Timeouts have visible retry behavior.

**FR-22 — Download and deletion.** Only authorized workspace users receive expiring links; email/webhook contains a reference/link to authenticated detail, never a public attachment. Accept: link expiry and tenant boundaries tested; attachment backups and deletions cover objects as well as database references. Deleting a response tombstones pending jobs so later retries cannot resend deleted content.

## 7. Results and delivery — P0

**FR-23 — Response inbox.** Cursor pagination, date/form/version/status filters, basic contact search and detail view. Accept: raw answer/transcript, normalized/confirmed value and generated content are visually separate; test records are labeled and excluded from real metrics. Staff notes do not mutate original respondent evidence; changes are attributed.

**FR-24 — Export.** Authorized asynchronous CSV with stable IDs, original versioned labels, typed values, status and version; temporary signed download. Accept: safe spreadsheet handling for formula-leading cells; exports enforce tenant scope and deletion state; large exports do not block submission traffic. Historical field meanings are never inferred from current labels.

**FR-25 — Email notification.** Send to verified workspace member recipients after submission; minimal metadata and authenticated response link by default. Accept: delivery attempt/remote ID recorded; suppression/bounce visible; notifications cannot send arbitrary respondent text to an unverified address. Optional respondent receipts and campaigns are deferred.

**FR-26 — Outbound webhook.** One endpoint per form initially, HTTPS, versioned payload, HMAC event/timestamp/body signature and documented retry contract. Accept: preview and test event; stable event ID; SSRF controls at registration and connection, redirects disabled; network timeouts bounded; failures retain response and delivery evidence.

**FR-27 — Recovery.** Delivery states Pending, In progress, Delivered, Retrying, Needs action, Failed/Unknown. Retry transient errors with jitter/Retry-After; stop on authorization/configuration failure. Accept: UI shows attempts/next retry/sanitized reason; safe replay retains event/mapping identity; timeout after possible remote success is Unknown until safe retry or reconciliation. Never promise exactly-once arbitrary webhook side effects.

**FR-28 — Typeform migration.** Import authorized definition into draft with source→Snapform ID map and supported/approximated/unsupported report. Accept: unsupported payments/widgets/complex rules block a “compatible” claim; compare representative source paths before cutover; allow pilot rollback to original links. Pasted text can help reconstruct a form but is not a verified vendor import. Historical responses, source credentials stored long-term, media scraping and ongoing sync are deferred.

**FR-29 — Basic analytics.** Per-form/version eligible starts, completed submissions, valid complete records, delivery within window, time to complete and inferred abandonment. Accept: denominator, period, traffic mode and test/bot exclusion shown; server counts dominate business totals; retries are not new starts/submissions. No raw answers in analytics events; optional marketing analytics respects launch-market choices.

## 8. AI — P0 with per-form opt-in

**FR-30 — Authoring generation.** Prompt/pasted brief produces supported typed operations against a base revision. Accept: at most one bounded repair pass; compiled proposal diff before apply; unsupported requirements listed; stale proposal requires rebase/review; AI never publishes or alters billing/destination authorization.

**FR-31 — Guided completion.** Standard fields are default; respondent may select guided help. English only; ≤12 user turns/session, ≤2 clarification follow-ups per field and ≤4 total, ≤30k input/3k output tokens cumulative, with a stricter monetary reservation cap. Accept: no duplicate accepted turn on retry; corrections recompute applicability; timeout, refusal, limit and provider outage preserve committed answers and expose fields immediately. These limits are initial policy values subject to evaluation.

**FR-32 — Structured candidates.** Extract allowed fields only; record source turn/span, normalization, ambiguity and confirmation status. Accept: “five thousand by November” cannot become a particular currency/day/year without existing explicit context or clarification; identity/date/currency corrections have held-out tests. Model confidence is not treated as calibrated probability.

**FR-33 — Knowledge.** Creator pastes approved FAQs/policy text, ≤20k characters, reviews and publishes a version. Accept: answers cite source entry; unsupported questions abstain and offer the configured business contact; session pins approved version. URL crawling, document ingestion, vector retrieval and live website access are deferred.

**FR-34 — Data/authority control.** Form/field AI opt-out, provider disclosure, bounded transcript context and server tools. Accept: excluded fields never enter prompts; user/knowledge instructions cannot access other tenants, change prices/recipients or invoke external actions. AI processing requires the relevant notice; refusal of optional AI leaves fields usable.

**FR-35 — Evaluation and kill switch.** Versioned fixtures and held-out data for authoring, extraction, grounding, correction and injection. Accept: release gates in technical foundation pass; operator can disable a feature/model by workspace or globally without stopping deterministic collection; model/prompt changes rerun evals and staged rollout.

## 9. Commerce and lifecycle — P0

**FR-36 — Plans and trial.** One limited trial plus one paid team SKU at launch; monthly/annual billing only if cancellation, proration and disclosures are implemented. Accept: seat/storage/submission/AI limits and renewal terms visible before checkout; final pricing follows pilot evidence; no hidden overage or “unlimited AI.”

**FR-37 — Checkout and entitlement.** Razorpay Subscriptions with Standard Checkout, plus Snapform-owned billing management; verified provider webhooks and reconciliation drive entitlement state. Accept: raw-body signature and duplicate/out-of-order event handling prevent duplicate credit or incorrect plan restoration; browser success is not payment proof; pending webhook delays show pending status and recover automatically. Owner can inspect renewal/status, access available receipts/invoices and cancel through supported API semantics. Test-mode currency/method/market coverage is established for the existing account; no Stripe-style hosted portal is assumed.

**FR-38 — Usage ledger.** Distinct counters for submitted records, AI started sessions, tokens/cost, files/bytes and seats. Accept: previews/imports/replays/technical retries are not billable submissions; unused AI reservations release on timeout; concurrent sessions cannot overspend a workspace hard budget. AI “start” counts only after first successful useful assistance and only once per session, with published caps.

**FR-39 — Limit/grace behavior.** Alerts at 80%/100%; optional AI hard-stops at allowance; base collection reserves one record slot at session start. Accept: sessions with valid reservations may finish after limit; new starts after exhaustion see a clear unavailable/contact state; abandoned reservations expire; no automatic overage charge. Owner can buy capacity explicitly. Default trial/plan quotas are pricing hypotheses in the business plan.

**FR-40 — Cancellation/dunning.** Cancel future renewal, show effective date, export access and remaining collection window. Accept: payment failures get a disclosed 7-day grace policy; no immediate data deletion; expired plans stop new starts after grace, allow reserved sessions to finish within validity, and retain owner export/read access for 30 days before scheduled deletion notices. Retention obligations and paid data access terms require commercial review.

## 10. Privacy, support and abuse — P0

**FR-41 — Retention/deletion.** Owner chooses submitted-record retention from 30/90/365 days, default 90; incomplete sessions 7 days; content-free audit/security logs 90 days. Accept: active-system deletion finishes within 7 days of scheduled/requested purge, covers files/derived data/exports/queued work, and documents backup expiry separately; holds are explicit and narrowly scoped. Verify timing against launch-market legal review.

**FR-42 — Data requests.** Owner can export/delete workspace; respondent requests reach the collecting business with identity verification and scoped support tooling. Accept: finding a response does not establish requester's identity; deletion is auditable without retaining deleted answer content; restored backups reapply deletion tombstones before reopening traffic.

**FR-43 — Platform abuse.** Publish rate limits, intake/AI concurrency caps, risk-based bot challenge, phishing/report-abuse path, moderation response and per-form emergency stop. Accept: one tenant cannot exhaust global capacity; Turnstile is validated server-side; security contact and abuse inbox have a named owner.

**FR-44 — Support access.** Support can inspect operational IDs and sanitized errors by default; content access requires a time-bound authorized case and audit. Accept: support impersonation is not an unlogged backdoor; receipt/history distinguishes operator from customer actions. Launch help includes migration, limits, AI data handling, delivery repair and cancellation.

## 11. Requirements added after hands-on competitor testing — P0

**FR-45 — Business-fact provenance.** AI-proposed company descriptions, service inclusions, prices and policies are separate from tone/brand-copy edits. Accept: each factual assertion identifies approved source or is marked unprovided; unprovided claims cannot enter published knowledge until the creator explicitly edits/approves them; generation success is never factual approval. Record the approver, version and affected sessions. This follows the observed generated Formless profile; it is not a claim about all competitor configurations.

**FR-46 — Intake readiness.** Creator defines which explicit fields/constraints make a record useful for the chosen workflow. Accept: a readiness checklist explains missing required business context and sample branch coverage; “not sure” routes to a configured follow-up state rather than invented values or automatic rejection; qualification is deterministic and visible to the operator. Start with templates and existing rule semantics; no separate scoring engine.

**FR-47 — Delivery preflight.** Preview shows the effective submitted record and exact sanitized email/webhook payload using the pinned mapping. Accept: test send is clearly labeled and does not count as real usage; last test result is visible before sharing; success means destination acknowledgment, and a payload/config change invalidates its earlier preflight result. Test events never trigger real marketing campaigns by default; customers see the destination and test purpose first.

## 12. Later requirements inventory

| Release gate | P1 capabilities | Preconditions |
|---|---|---|
| V1.1 activation/retention | First native destination if not in V1, Jotform adapter, improved templates, explicit emailed resume | Repeated demand, connector tests, secure resume design |
| V1.5 expansion | Custom domains, approved translations, repeatable sections, simple scoring/calculations, reusable theme/template libraries | Stable engine semantics; support/cost capacity; locale evals |
| V2 workflow | Bookings, provider payments, document signing, approvals, field-level delivery mappings | Provider/merchant/legal feasibility; reconciliation and lifecycle model |
| V2 intelligence | Larger knowledge ingestion/retrieval, evidence-linked summaries/themes, bounded query assistance | Tenant isolation, ingest threat model, consented benchmark and demonstrated value |
| Enterprise/vertical product | SSO/SCIM, audit exports, granular roles, residency options, offline client, contractual SLA | Demand and contracts justify ongoing security, operations and specialist staffing |

No later release inherits V1 acceptance automatically. Write a scoped specification and commercial case before scheduling each capability.
