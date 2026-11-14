# ADR-024: Ship strict private uploads before malware scanning

Accepted 14 November 2026 from the user's launch decision. It changes FR-21 for launch: uploads ship without the quarantine and scanner, with stricter limits instead. FR-21's scanning, pending and rejected states stay the target for a later slice.

**Limits.** Pro workspaces only. Ten types: PDF, PNG, JPEG, WEBP, GIF, DOCX, XLSX, PPTX, TXT and CSV. No archives, executables, SVG, HTML or macro-enabled Office files. 25 MB per file, at most 3 files per question (the existing `maxFiles`). The rules live in `packages/contracts/src/uploads.ts` and `upload-checks.ts`; migration 0046 repeats the size, type and plan limits.

**Checks.** The declared type must be allowed, and every type has a byte check while the file streams: image and PDF signatures; Office files must be a single-disk zip whose central directory holds the manifest, relationships and the type's main part, with no macro project or encrypted entry, and whose manifest names the main content type; text must be NUL-free UTF-8. Names are display text only, cleaned of paths, controls, bidirectional and invisible characters, capped at 200 characters and given an extension for the verified type.

**Storage and access.** One private R2 bucket, `snapform-uploads`, with no public or signed URLs. Keys are `workspace/form/session/<256-bit random>`. Respondents upload one file per request with their session capability, streamed through the API Worker. Owners, editors and viewers download only through an authenticated route that always answers as an attachment with `nosniff`. Webhooks and CSV carry names and metadata, never bytes or links.

**Deletion.** Purge deletes every object under a purge intent's prefix before finalizing its rows. Abandoned uploads go with their expired session.

**Consequences.** A malicious file of an allowed type can reach a workspace member's device; the attachment-only download, type checks and macro refusal reduce but do not remove that risk. Uploads have no backup copies yet (NFR-06 uploads RPO is not met), and purge is still disabled in production. Scanning, quarantine states and upload backups must land before these limits are relaxed.
