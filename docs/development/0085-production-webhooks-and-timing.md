# Production webhooks and request timing — 30 October 2026

PRs 18 and 19 passed hosted verification and merged with their focused commits.
The private receiver was deployed before API/frontend activation. Live versions:
Jobs `4862840c-2b08-4715-815e-72e0d6d5aa75`, API
`bfa635a5-cd74-4a05-9572-e5cac18ecc63`, web
`a6e40b7e-5754-4c92-9be0-b2192122becd`. Existing data/migrations were preserved.
The Jobs encryption key is a private Worker secret, matching the API configuration;
QA email recipient restrictions remain in place.

A new browser preflight on `snapform.jacked.dev` was acknowledged on attempt one
with HTTP 204 (`8f80ea2a-b5b2-4240-86f0-974487b62dbe`). The deployed inbox loaded
saved delivery history and its exact synthetic preview; its console was clean.
[Production evidence](../evidence/61-production-webhook-preflight.png).
The local controlled 429/503 test eventually acknowledged on attempt three.
An early wake while backoff was active claimed zero rows. No real customer data
or unrelated destination was used.

Two read-only direct-TCP diagnostics also showed local network latency spikes
and close errors. That did not justify replacing the existing driver or adding
its package to the application. No dependency was added. One deployed health
read measured 843ms and one public-form read 1096ms including client networking;
these samples are not p95 or mobile SLO evidence. Intermittent local request
uncertainty is still a material test limitation, with idempotent recovery verified.

The next operations slice adds native, allowlisted timing for Express-backed API
responses. It answers: which route families fail or slow down, whether a response
finished or disconnected, and which server-generated request ID correlates with
it. Each response emits once across finish/close events. Paths, queries, headers,
cookies, user/workspace/form IDs, answers and errors are never serialized. Method
and route labels have fixed cardinality; request ID is a log field, not a metric
label. Early Worker-only responses and provider forwarding remain separate from
these Express completion events. This is instrumentation, not an alert system.

A failing missing-module test preceded implementation. Five tests cover field
allowlisting, forged/unbounded inputs, route families, a real Worker response,
and concurrent independent correlation IDs. Dynamic import of the test binding
initially hung; using the test framework's standard static binding import fixed
the test setup. The full real-workerd suite passes 79 tests, plus strict types,
formatting, lint and the API production bundle. Browser inbox loading and keyboard
refresh still work; an unknown owned API path returns 404 with a fresh generated
request ID, ignoring a supplied capability-like header. The web bundle is unchanged.

R2 subscription/terms activation was explicitly approved. Activation currently
requires the user to complete Cloudflare's secure payment-method/billing-address
form; no card data was requested in chat or filled by the agent. Retention,
delete/recovery workflows, actual alert delivery and demonstrated backup restore
remain required before the six-step showcase scope is complete.
