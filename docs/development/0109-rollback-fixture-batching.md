# Bounded fixture setup — 31 October 2026

Publication, intake and response-reader tests now share two small test-only seed
helpers. A form fixture uses one native SQL batch; a published response fixture
uses one additional batch. Both require the caller's rollback transaction and
the restricted runtime login. No owner credential, commit, database or branch is
created. Response admission/submission still use the canonical SQL functions,
quota accounting and outbox trigger. Preparation uses the shared pure contracts.

Fixture text is encoded before entering SQL syntax. A retained real database
test verifies an apostrophe/injection-shaped Unicode name remains data, owner
reads work, foreign membership is denied, pinned answers preserve zero, the
changed draft is separate, and no fixture user survives rollback. It passed in
7.06 seconds. A separate restricted native setup probe took 402 ms and rolled
back. These are local measurements, not production latency targets.

Only setup changed in the three existing files. Their complete test bodies and
assertions remain byte-for-byte unchanged, including actor/tenant/viewer checks,
immutable versions, cursor behavior and exports. Publication/admission/mutation
features retain their dedicated tests. The new reader fixture directly seeds its
initial published version and draft change instead of repeatedly testing those
other TypeScript APIs as incidental setup.

No runtime dependency, application code, retry, worker count, test assertion or
timeout was changed by this slice. Remote connection/latency failures remain
separate diagnostics; full CI remains a merge gate.
