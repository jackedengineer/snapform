# Respondent transport and recovery lifetime

29 October 2026. The native client transport reads public definitions/configuration, creates and resumes sessions, and sends revisioned save/submit requests. It omits account cookies, uses no-store requests, keeps the capability only in Authorization, bounds requests with a timeout and never blindly retries a mutation. A mutation response must match the operation identity, result revision and lifecycle state. Failures use canned messages/categories rather than reflecting provider or raw server diagnostics.

Three behavioral tests were written before the module and failed on the missing implementation. They now pass for credential placement, anonymous transport, stable single-send operations, unrelated receipt rejection, conflicts and sanitized connection failures.

While connecting browser recovery, the implementation was checked against FR-15. The initial 24-hour lifetime in ADR-018 did not meet the specified seven-day same-browser recovery window. A new assertion first failed against that constructor. Forward migration 0014 aligns newly created sessions with seven days; existing credentials are not extended. All four intake-session tests pass after migration. The fifteen-minute quota reservation remains separate and unchanged. Historical decisions retain their original wording; this record amends the lifetime for new admissions.

This transport has not yet been attached to a collector screen or local recovery store. No end-user browser recovery/submission is claimed by this commit. No package was added.
