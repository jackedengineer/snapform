# Notification API and scheduler — 29 October 2026

Verified workspace members can read the default-off setting and the latest twenty
delivery summaries. Only owners/editors may change settings with an expected
revision. The API rejects unknown query/body fields and arbitrary recipients,
uses the existing private auth/origin/rate/body-size boundaries, and returns no
recipient email, provider diagnostics, key or answers. Settings reads share a
small authorized projection with the overview; RLS still applies to both tables.

Cron now reconciles email work independently of completed Queue transport receipts.
It records each provider result before counting acceptance. Lost results retain
their lease for recovery; fenced-out results are counted separately. Logs contain
aggregate outcomes only. Queue receipt semantics remain explicitly transport-only.
The new sender adds 1.82 KiB gzip to the jobs bundle (218.08 KiB total); API is
729.44 KiB gzip. Client assets remain 199.67 KiB JS / 7.66 KiB CSS / 36.07 KiB font.
No dependency was added.

Contract, database overview and actual unauthenticated Worker tests failed before
the new endpoints/projection existed, then passed. Three dispatch tests cover
durable result ordering, fenced results, lost database receipts, retry/attention
counts and empty claims. Their initial execution overlapped module creation and
passed; a red execution is not claimed for those three tests.

Authenticated requests through the actual local web-to-Express Worker binding
verified: default-off/empty overview 200; recipient override, malformed flags and
invalid revisions 422; stale setting 409; foreign origin 403; unrelated tenant 404;
unknown query 422. A temporary QA auth session was signed out, and these probes
wrote no settings/delivery rows. Successful changes are covered with rollback-only
database fixtures. The existing browser inbox was reloaded for regression checking.

Production email secrets, settings/history controls, signed provider receipts and
their normal/power/adversarial browser journeys remain release gates. The scheduler
has not been deployed and no live notification has been sent by this slice.

Final local checks: 200 pure tests, 66 API Worker tests, 14 job Worker tests and
38 rollback database tests pass. Pure coverage remains 100% lines/functions,
99.58% statements and 97.96% branches. Strict checks and build/bundle gates pass.
At actual 320px the browser inbox still shows all three owned QA answers and the
version badge, with no overflow or console warnings/errors.
