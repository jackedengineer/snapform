# ADR-017: Immutable snapshots and a separate live publication

Accepted 29 October 2026. Implements the existing requirement that a respondent's opened form cannot change underneath them when its creator edits or republishes a draft.

Store each compiled publication in an append-only `form_version` row with its own UUID, sequential number, source draft revision and complete definition. A separate `form_publication` row holds the stable public identity, selected version and active flag. The flag defaults to false. Foreign keys bind the pointer to the same workspace and form as its version. The runtime role may read/insert snapshots; it has no snapshot UPDATE/DELETE privilege or policy. Both tables require actual membership through the existing transaction-local RLS context.

The publishing transaction will lock the existing form row, read the current draft, require the caller's expected revision, compile the saved definition, and insert the snapshot and pointer change atomically. The requested snapshot UUID also identifies that publish operation. Replaying an existing UUID must return its original snapshot plus current publication state; it must never reactivate an unpublished form or replace a later publication. A UUID reused with another actor or source revision is a conflict. An explicit new publish may create a new snapshot even when the draft revision is unchanged.

Unpublishing will compare the selected version before deactivation, so retrying an old action cannot deactivate a newer publication. A public link remains stable across publications; inactive forms stop accepting new and in-progress submissions. The UI must explain that consequence. Respondent sessions will pin an immutable version, so a later publication cannot reinterpret answers already entered under an earlier version.

The first migration adds only the private tables and explicit runtime privileges. Anonymous lookup and collection are separate reviewed boundaries; no generic table access or caller-selected workspace context will be exposed publicly. Retention/deletion must intentionally remove dependent pointers and data through a privileged, scoped path rather than giving the ordinary Worker a snapshot update/delete privilege.

No second database, new provider, queue or cache is needed for publishing. Additive migrations preserve existing drafts. Rollback of this foundation means reverting application code and leaving the unused tables in place; do not drop shared production data as a routine rollback.
