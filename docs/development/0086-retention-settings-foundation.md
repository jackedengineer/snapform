# Retention policy foundation — 30 October 2026

Shared strict contracts support 30/90/365 elapsed days, explicit deletion
acknowledgment and optimistic revisions. Missing policies read as 90 days,
revision zero. Members can inspect policy; only actual owners can create/update
it. Helpers validate again and use the existing membership-scoped transaction.
A stale revision cannot overwrite a newer policy. No purge UI is exposed yet.

Migration 0029 adds only `workspace_retention`. The generated snapshot was
compared with 0028: no existing table, enum, role, policy, view or sequence changed.
The new table forces RLS, checks allowed days/revisions, checks actual owner
membership rather than a role setting, and grants runtime SELECT/INSERT/UPDATE
only. Runtime DELETE/TRUNCATE and direct Jobs reads remain denied. Migration
ownership remains in the private operator configuration. The additive migration
was reviewed and applied to the one shared database without modifying responses.

Tests first failed on missing contracts/helpers. A validation failure also caught
a synchronous throw in a helper expected to return a promise; the repository's
async helper convention fixes that. Real restricted-login tests verify defaults,
owner changes, stale writes, viewer reads, editor/viewer denial, unknown/foreign
workspaces, forged role context, native SQL day constraints and actual privileges.
All synthetic writes and negative SQL statements roll back, including savepoints.
The complete database suite passes 51 tests in 212.91s. All 232 pure tests pass;
coverage is lines 99.83%, functions 100%, statements 99.55%, branches 98.10%.
Types, lint, formatting, production builds and bundle gates pass. Client JS
remains 204.34 KiB gzip; inbox 162.78 KiB. No dependency added.

This is the internal settings foundation. The bounded purge/recovery-ledger
ordering, owner deletion/cancellation, HTTP and browser controls remain to be
implemented and verified before retention can be presented as complete. See the
[execution specification](../specs/retention.md).

Hosted CI exposed a 30-second timeout in the pre-existing combined intake
save/retry/submit/unpublish test. The unchanged scenario passed locally in
16.33 seconds. It is now two independent rollback-only journeys, preserving all
assertions and the existing 30-second per-test limit; the entire intake file
passes seven tests in 54.49 seconds locally. This reduces sequential network
work per scenario, not the assertion set, and is not proof of resolved network
latency. Updated hosted checks remain required.
