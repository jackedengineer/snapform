# Confirmed deletion receipts in the client

1 November 2026. The client uses native fetch, bounded timeouts, same-origin
credentials, no caching and refused redirects. Strict shared envelopes and
workspace/target/request identity checks reject unrelated or unexpected success
responses. Scheduling retains its operation UUID and cancellation sends the saved
revision. Errors expose fixed guidance rather than provider diagnostics.

Tests failed before implementation. The actual QueryClient regressions also
reproduced delayed pre-mutation GETs replacing confirmed scheduling/cancellation,
an unmount during cache publication and an old control cancelling a remounted
control's same-target read. The narrow cache helper now checks lifetime before
and after cancelling the exact user/workspace/kind/target query, then caches the
server receipt. Unrelated reads are preserved. Read-only review confirmed both
corrections. No optimistic deletion status or new dependency.

All six HTTP-contract/QueryClient tests pass. The native confirmation form uses
required inputs, the shared exact-match predicate and browser validity/focus
handling; it has no form-state dependency. Its browser journey and the combined
feature's 248 tests/final artifacts accompany the separate UI slice in 0122.
