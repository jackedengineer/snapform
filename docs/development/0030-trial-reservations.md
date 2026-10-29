# Trial response admission reservations

29 October 2026. Migration 0011 adds a fifteen-minute response reservation and an independent consumed-trial counter. Session creation now checks verified creator identity, the original 14-day account trial and fifty used/reserved slots across that creator's workspaces. A counter-row update serializes starts before counting/reserving; the publication is then locked/read and the pinned session inserted. The runtime cannot reset the counter or change reservation metadata directly.

Three behavioral cases first failed against the previous constructor, which still admitted a 51st session and ignored trial expiry/workspace resets. They now pass after the reviewed forward migration. A fourth case proves direct usage-counter reset is denied. The complete 24 real database tests pass with rollback-only fixtures; no second database/branch or reset was used. Types, lint and formatting pass. No package was added.

The policy keeps short reservations on temporarily unpublished forms until expiry, preventing capacity revival through repeated reopening. An independent consumed counter is ready for the durable-submit transaction, so future response deletion will not reset billing usage. Consumption, renewal, creator-facing billing status and Razorpay-paid periods are still upcoming capabilities; no response or payment has been fabricated.

The existing public read and creator UI are unchanged. Public session creation is not exposed until its challenge/admission path is connected. [ADR-019](../decisions/ADR-019-trial-response-reservations.md) records the business and concurrency rules.
