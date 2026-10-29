# Notification scenario isolation — 29 October 2026

Hosted Verify run 40921516278 passed the build, strict checks, pure/Worker suites
and forty database cases, then failed the combined notification scenario at its
existing 30-second limit. The same combined scenario passed locally, but grouped
future-only opt-in, snapshot projection, revision/cancellation and permissions
into one remote transaction with many round trips.

It is now three independently seeded rollback-only scenarios: future submissions
and owner snapshot; revision/cancellation/re-enable; membership and direct-write
authority. The read-only jobs ACL case remains separate. A TypeScript AST
comparison preserved all nineteen business assertions, normalizing only formatting
and trailing commas. Each seeded scenario retains explicit rollback verification;
the existing 30-second per-scenario ceiling was not raised. The four focused tests
pass locally. No production behavior, migration, budget or CI gate changed.
