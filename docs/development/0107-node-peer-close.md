# Node peer-close regression — 31 October 2026

The real Neon driver, with a synthetic native EventTarget WebSocket, reproduced
a query flush after the peer had already closed. The regression observed one
late write before the fix and zero afterward. Query rejection and repeated
cleanup still settle. Normal Node termination and pre-authentication peer close
also pass. Workers already used immediate writes; Node now uses that same
per-client setting, removing the runtime-specific branch.

Three Node transport tests and five affected real Worker tests passed. No retry,
timeout increase, new dependency, database, global connection or application
protocol change was introduced. Authentication still completes before the
connection is returned. Browser collector save/reload/back/review/submission and
inbox delivery checks were performed against the unchanged Worker transport path.

This fixes the deferred-write race, not every remote latency episode. Private
local traces also observed 1–5.4-second query delays and intermittent connection
timeouts. A one-worker experiment did not eliminate them and was reverted.
Native WebSocket versus ws, and batched versus immediate writes, did not show a
consistent latency advantage in bounded alternating read-only samples. The ws
package was not added. Direct versus pooled connections also measured similarly;
no connection URLs were changed by that experiment. Raw SQL, answers and
credentials were excluded from these timing records.

The complete database suite remains a merge gate. A passing transport regression
does not establish that external-service delays have been eliminated, nor does
it establish the production latency SLOs. Source: the pinned Neon 1.2.0 rawWrite
implementation and its [coalesceWrites documentation](https://github.com/neondatabase/serverless/blob/main/CONFIG.md#coalescewrites-boolean).
