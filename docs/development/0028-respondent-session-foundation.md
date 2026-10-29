# Respondent session database foundation

29 October 2026. Migration 0010 adds a capability-protected response session pinned to a published version. It includes bounded answer storage, positive revision, explicit status, absolute expiry, immutable tenant/version relationships and scoped read/update policies. Three fixed-path SQL functions enforce capability access, derive creation ownership from a live publication and read the pinned snapshot. Table/column grants prevent direct creation, deletion and credential/ownership changes by the runtime.

New contract tests first failed before their module existed; both now pass. The shared explicit answer-input schema was exported without changing decoding behavior. Session output rejects credential hashes and account roles; creation does not accept caller-selected ownership. All 158 units pass, with unchanged passing pure-core coverage.

The actual restricted-role suite first failed before schema/repository implementation. Its next run caught an incorrect assumption that a raw SQL timestamp would be mapped to a JavaScript Date. The repository now formats UTC expiry explicitly and validates the complete returned session against the contract. The focused repeat and all 20 database tests pass. Fixtures roll back in the same database; no test database/branch or reset was used.

The cases verify opened-version pinning across draft edits/republishing, new sessions receiving the new version, unpublishing revoking existing/new access, mismatched session/public/hash denial, forged owner context remaining unreadable, unscoped writes affecting zero rows, direct insertion/deletion denied and credential/version updates denied. Expiry is checked as an explicit future UTC value; an actual expired-session browser drill remains pending the collector UI.

Types, lint and formatting pass. No dependency was added. This is a database foundation, not yet an anonymous session creation HTTP endpoint, autosave or submitted response. Existing form/read behavior is unchanged. [ADR-018](../decisions/ADR-018-respondent-capabilities.md) records scope and the remaining guards.
