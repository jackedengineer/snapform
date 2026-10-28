# Draft storage and membership-backed policies

28 October 2026. Reviewed forward migrations 0005–0006 add form identities, the current draft and immutable operation receipts in the existing shared Neon database. Composite workspace/form foreign keys prevent attaching a draft or receipt to a form in another workspace. Receipts record actor, base/result revision and a bounded SHA-256 hash; runtime UPDATE/DELETE privileges are absent. Draft revisions must be positive and each receipt advances one revision. Migration credentials remain out of runtime configuration.

Form policies require the selected transaction workspace and actual membership. Writes additionally require actual owner/editor membership and matching actor attribution. They do not trust the role setting alone. A real restricted-login test deliberately forged an owner setting while acting as a viewer: the write still affected zero rows. Viewer insertion was denied; cross-workspace draft linkage failed its composite foreign key. Unscoped reads returned no rows. All synthetic fixture writes rolled back.

Eleven database tests now pass. Draft DTO tests require stable operation IDs and bounded expected revisions, reject client-supplied identity/tenant fields, and reject a receipt ahead of the current revision. Existing production-build/Worker/type/lint/format checks pass. Generated migration snapshots were reviewed separately from handwritten code. Applied migrations were not rewritten; formatting their generated metadata does not alter applied SQL.

These tables are an internal persistence foundation. Revision locking, idempotent saves, authoring UI and their browser workflows follow in subsequent slices; this increment does not claim them shipped.
