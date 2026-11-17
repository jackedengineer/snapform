# ADR-023: Workspace plans replace the creator trial

Accepted 13 November 2026 from the user's launch pricing decision. Supersedes the trial clock and lifetime allowance in [ADR-019](ADR-019-trial-response-reservations.md); its reservation, lock and counter rules stay.

**Plans.** Billing is per workspace. Free allows 3 live forms, 100 submitted responses per calendar month, 1 seat and shows a "Powered by Snapform" badge. Pro costs ₹1,499 or $19 a month, or ₹14,990 or $190 a year, and allows unlimited live forms, 2,000 responses a month and 3 seats, with branding, uploads and embed flags for later features. The rules live in `packages/contracts/src/plans.ts`; migration 0041 repeats the limits because the database enforces them.

**Usage window.** A month is the UTC calendar month: usage resets at 00:00 UTC on the 1st for every workspace. Consumed responses are counted per workspace and month in a counter that deleting responses does not reduce. A start reserves capacity for 15 minutes as before; used plus unexpired reservations may not reach the limit. A full workspace answers `FORM_NOT_ACCEPTING` instead of a silent 404.

**Entitlement.** A workspace with no plan row is Free. Pro lasts exactly while a paid Razorpay period has not ended, so cancellation, halted payment or completion keeps Pro until the period end and then falls back to Free without a job. A downgrade never unpublishes or deletes: live forms stay live and updatable, new forms beyond the Free limit cannot go live, and responses continue up to the Free allowance.

**Provider.** Razorpay Subscriptions in test mode only. Webhooks are verified with HMAC-SHA256 over the raw body, deduplicated by event ID and applied by a SECURITY DEFINER function; out-of-order events can only extend a paid period, and status follows the newest event. Checkout success is never treated as payment proof. Billing tables have no runtime grants.

**Consequences.** Creators past the old 14 days or 50 responses collect again. Free can be multiplied by creating workspaces; that abuse risk is accepted for launch and should be watched. The old `trial_response_usage` table is no longer written and can be dropped in a later contract migration.
