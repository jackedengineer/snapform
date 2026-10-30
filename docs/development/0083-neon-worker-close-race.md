# Neon Worker write/close regression — 30 October 2026

A local webhook send exposed `WebSocket.send()` after close and an unfinished
Worker request. Neon 1.2.0 batches writes with a zero-delay timer by default.
If the peer closes before that timer runs, the send throws outside the query's
promise. Disable `coalesceWrites` per connection in the Worker runtime, keeping
Node's transport configuration unchanged. Authentication still completes before
`openDatabase` resolves, and request cleanup still awaits the real disconnect.
No retry, pool, dependency, schema or timeout increase is introduced.

The regression uses a native workerd WebSocket pair and a minimal synthetic
PostgreSQL authentication exchange. It checks normal termination and peer close
during a query. Both constructor paths are disabled so the driver's fetch upgrade
uses only the owned synthetic transport. A send spy counts writes after close:
the baseline attempted one; the fix attempts zero and rejects the query. This
checks the deferred failure explicitly instead of merely passing while workerd
prints an unhandled exception.

Earlier verification: 74 API tests passed, including the two new regressions and
actual Neon lifecycle tests. At 1280px, the real local inbox loaded, saved its
webhook URL, refreshed, rejected a loopback destination, and recovered after
restoring its saved URL. One main landmark, no unnamed inputs, no horizontal
reflow and no console errors were observed. [Browser evidence](../evidence/58-neon-worker-recovery.png).
This evidence covers connection recovery and the existing settings controls;
it does not establish outbound webhook delivery or production latency targets.

The separate Node database fixture timeouts remain under investigation. Neither
passing focused runs nor this Worker-specific fix is evidence that they are
resolved. A bounded two-worker database test limit reduces concurrent synthetic
load on the shared development/production database; assertions and time limits
remain unchanged. All automated fixture writes roll back.

Source: pinned Neon 1.2.0 `rawWrite` implementation and
[official coalesceWrites configuration](https://github.com/neondatabase/serverless/blob/main/CONFIG.md#coalescewrites-boolean).

A subsequent instrumented two-worker full database run passed all 50 tests across
18 files in 207.15s. Its 2,417 SQL round trips measured median 125ms, p95 198ms,
maximum 947ms; 50 connections took at most 2,223ms. Three focused response tests
also passed in 46.49s. Instrumentation was then removed. This local run did not
reproduce the earlier Node timeout, expose a lock stall, or justify changing the
Node WebSocket implementation. These timings include synthetic fixture setup
and are not production endpoint SLO measurements. Intermittent network latency
remains a limitation of tests against the single remote database.

The subsequent parallel workerd run reproduced three live-connection timeouts
(71/74 passed), so it was not accepted as green. The affected three files passed
serially (8/8), and the complete API suite then passed 74/74 in 40.59s with one
API test worker. API tests now use one worker while database tests use two;
explicit concurrency correctness belongs in coordinated multi-connection tests,
not incidental file scheduling. This limits fixture load without changing the
application's request concurrency. Formatting, strict types, lint, core coverage,
33 Jobs tests, production builds, bundle gates and production dependency audit
passed. Core coverage remains 99.82% lines, 100% functions, 99.54% statements,
98.23% branches. Total client JS is 202.32 KiB gzip, inbox 160.76 KiB,
CSS 7.97 KiB, font 36.07 KiB. Browser delivery/retry checks remain the next gate.
