# Production owner notifications — 29 October 2026

PR 6 merged through protected main at 6ce69e81f56dba02104862cb07751a9d63d660da.
Hosted Verify run 40923055924 passed all gates: 208 pure, 67 API Worker, 19 jobs
Worker, 43 rollback database and three auth integration tests, preview/reload,
build, strict checks, bundle and production dependency audit. The artifact still
passes the original 200 KiB aggregate JS gate at 199.96 KiB. The separately
approved route-budget tooling is not part of this deployment.

Deployed versions (previous rollback points in parentheses):
- API d6747c90-cd00-4159-be75-f8bfa7d7d74d
  (7ce0365a-d34b-489f-9137-3ee36119d5d3).
- Jobs af849dea-e509-44c4-8e6a-838a651f6d9f
  (255832ec-2e8e-42a6-9271-d48064a98630, transport code plus private secrets).
- Web 0aacc056-7a31-492b-9e84-bbfbfb9e75c5
  (5cb13543-fddd-466d-aef1-b93c6f60ddcd), snapform.jacked.dev.

Wrangler reported startup times of 154/27/30ms for API/Jobs/Web. These are platform
initialization measurements, not request percentiles. API/Jobs/Web upload gzip
sizes are 729.81/219.83/363.25 KiB; server code does not enter the client budget.

The queued owned QA notification reached Resend and the recipient mail server.
The authenticated email.delivered callback returned 204 on its first attempt;
the provider tag/recipient match the durable original delivery. Neon records
delivered, a provider ID and acceptance timestamp, with two total attempts:
one earlier local configuration failure and one actual provider send. The email
contains only a reference and authenticated inbox link, with no answers/title.
This proves mail-server delivery, not human reading. No Gmail inbox was read for
this check. Overall response-to-email time was deliberately held for configuration
and CI; it is not production latency evidence.

Power check: replaying that receipt from Resend returned 204 again (provider event
attempt count two). Independent reads show unchanged status, attempt count,
provider ID, acceptance time and update time. QA opt-out persisted at revision 8
without erasing delivered history. Production browser history has no retry action
for delivered/cancelled messages. Actual 1280×720 and 320×812 layouts have no
overflow; DOM checks found one main, no duplicate IDs/unnamed buttons, and console
warnings/errors were empty. Screenshots 53/54 contain no response answers.

Actual production HTTP checks: delivered replay 409; recipient override 422;
foreign origin 403; unrelated workspace 404; callback GET 405, forged signature
401 and oversized bytes 413. Error bodies expose no answers or internal details.
Temporary probe authentication was signed out. Provider keys remain private,
masked in the dashboard and stored in Worker secrets, never Git.

Sending remains restricted to the approved QA recipient while remaining release
work is completed. Remove that private allowlist only as an explicit release
configuration step after checking pending work. Signed outbound webhooks and
retention/monitoring/backup recovery remain open. The isolated local cancelled
Worker request documented in 0064 was not reproduced in ten subsequent reads;
its cause and production SLOs are not claimed resolved by this release.
