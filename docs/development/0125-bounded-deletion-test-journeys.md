# Bound deletion test journeys without weakening their gates

1 November 2026. Hosted run 41318383648 failed the combined deletion database
journey at its unchanged 30-second deadline. Core/UI, API and Jobs checks had
passed; 62 other database tests passed. This was a real remaining release failure.

The test now uses the existing restricted-role batched response fixture and three
independent rollback transactions for authorization, response cancellation and
workspace cancellation. Creation/publication/admission keep their separate tests.
Every original matcher assertion is retained (31 original matcher calls; 32 now,
including an explicit post-rollback absence check). No timeout, assertion,
coverage requirement or concurrency gate was relaxed. No runtime code changed.

The three focused journeys passed in 17.57 seconds combined. The full database
suite passed 65 tests in 99.18 seconds. Fast checks passed. All fixtures use the
one shared Neon database and roll back; no second database or committed synthetic
fixture was created. Hosted verification still has to pass for the revised head.
