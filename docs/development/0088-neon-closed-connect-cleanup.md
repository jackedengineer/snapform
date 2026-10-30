# Authentication-stage disconnect cleanup

A repeated rollback-only purge drill exited with Node's unsettled top-level
await diagnostic while opening its database connection, before fixture writes.
The real driver reproduced the issue with a synthetic peer closing before
authentication: its connection promise rejects, but cleanup calls `end()` on
an already-closed stream and waits for an event that already fired. In Node the
reproduction remained unsettled; workerd also attempted a write after close.

The client now observes its own socket close before connecting. Cleanup reuses
that actual disconnect result and calls `end()` at most once while open. It
never sends another termination after an observed peer close. Readiness still
requires server authentication, and the prior Worker-only unbuffered-write fix
remains. No retry, transaction semantics, timeout or test assertion is weakened.
No transport package, new database or alternate provider is introduced.

Both deterministic regressions failed before the fix and pass afterward using
the actual Neon driver: one Node transport peer and one native Worker
WebSocketPair. Existing graceful termination and query-close checks also pass,
including repeated/concurrent cleanup. The errors stay fixed and credential-free.

This fixes a concrete cleanup bug, not every intermittent network failure. One
subsequent complete database run had 18 failures / 35 passes in 323.46 seconds,
including connection deadlines and test timeouts. A read-only HTTP activity
check showed clients waiting for client input, without a server-side lock wait.
A later alternating read-only comparison passed five native WebSocket and five
existing development `ws` connections, with no advantage supporting a transport
dependency change. Full gates are rerun after that failure; their actual outcome
must be recorded before merge.

Browser regression at 1280×720: an uncertain inbox request
showed the reconnect state, keyboard retry recovered saved responses, typed zero
and confirmation values remained correct, and back navigation preserved the
list. A forged workspace returned NOT_FOUND; an unknown query returned
INVALID_CURSOR, with no answers. The browser console had no errors/warnings.
[Recovered inbox, without answer contents](../evidence/63-inbox-connection-recovery.jpg).
These runs do not establish a p95 or permanent network reliability claim.

The second complete local run had 45 passes / eight timeouts in 242.42 seconds.
All five affected files then passed their 22 tests in 108.73 seconds. Isolated
inbox/export tests passed with default and unbatched writes (38.47 vs 38.97
seconds), and a normal Node PostgreSQL termination check passed; Node batching
therefore stays unchanged. All 80 Worker API, three real auth integration and
five recovery tests pass, as do strict checks, builds and bundle gates. The
hosted full-suite gate is still required before merging this candidate.
