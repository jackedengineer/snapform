# Retention policy controls

Authenticated workspace members can inspect the strict 30/90/365-day policy;
only an actual workspace owner can save it. The API applies the existing private
body limit, JSON requirement, same-origin mutation protection, session checks,
role authorization and revision conflict handling. Unknown query keys and invalid
acknowledgement/periods fail validation. Shared database helpers repeat validation
and RLS checks; browser controls are not the permission boundary.

The workspace page uses native details, select, checkbox and form validation.
Changes require acknowledgement and remain explicit; stale/failed requests are
not retried blindly. Query state is scoped to user/workspace. A successful save
cancels pending policy reads before publishing its receipt, preventing an older
GET from overwriting the new policy. The real QueryClient regression reproduced
that failure before the fix and passes afterward.

Validation: 238 unit tests with core coverage 99.83% lines/100% functions,
82 actual Worker tests, strict types/lint/format, production builds and bundle
gates. Total client JS 205.82 KiB gzip (230 KiB limit), CSS 8.52 KiB (20 KiB limit);
workspace page159.20 KiB. No new dependency. Browser expected/observed results and
limitations are recorded in 0095; the synthetic policy was restored to 90 days.

These controls are verified locally. Production deployment remains gated on
scheduled purge, recovery replay and operational failure verification. Policy
CRUD alone is not evidence that expired content has been deleted.
