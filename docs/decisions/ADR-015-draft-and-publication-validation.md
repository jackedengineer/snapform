# ADR-015: Save structurally safe drafts; compile before use

28 October 2026. Accepted within the authorized authoring/recovery requirements.

A creator must be able to clear a label, delete the last choice or temporarily invert a min/max pair while editing without losing that state on refresh. Treating every intermediate draft as publishable would either prevent autosave or require a second, drifting local definition format. Keep one bounded typed definition format instead.

Draft validation retains strict keys/types, stable unique identities, well-formed text, finite/safe numeric bounds, known units/currencies, immutable file AI exclusions and all count/byte/depth limits. It may store blank labels/titles, empty choice sets and inconsistent cross-field ranges. The semantic compiler must reject each such condition before preview interpretation or publication. Existing negative assertions for those conditions move to compiler tests; they are not discarded or converted into a relaxed public acceptance gate. No coverage threshold, checker or security requirement changes.

The builder can persist incomplete edits and show targeted publish diagnostics. The evaluator already requires successful compilation. The future publish transaction must compile the exact locked draft revision before exposing an immutable version; saving a draft never publishes it. No published definitions or customer data exist yet, so this does not require a stored-version migration.
