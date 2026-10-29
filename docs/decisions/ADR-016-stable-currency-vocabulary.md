# ADR-016: Keep currency metadata stable across runtimes

Accepted 29 October 2026.

The original block schema derived accepted currency codes from `Intl.supportedValuesOf('currency')` at module load. The new settings UI initially did the same. The ECMAScript Internationalization specification defines the available catalog as implementation-defined. During review the browser offered 159 codes while Node/ICU 78.2 reported 162. A catalog difference or runtime upgrade must not change whether an already-saved form definition is readable.

Contract v1 now owns a frozen, sorted vocabulary snapshotted from the configured Node 24 / ICU 78.2 runtime. The settings menu and shared block validator both consume that exact list. This preserves legacy currency metadata in the contract. It is a supported form-unit vocabulary, not a claim to enumerate every current financial product or payment currency. Razorpay billing currencies are a separate provider contract.

Additions need a client/server rollout review: older browser bundles may reject a newly introduced code, so a live rollout needs capability gating or an appropriate definition-version transition before authoring it. Existing codes must not be removed merely because a runtime's locale data changes; any actual retirement needs a documented migration rather than silently invalidating saved definitions. No database migration is required because the vocabulary only retains/adds supported metadata and existing QA forms use supported codes.

A regression test first failed when the runtime catalog was reduced to USD, then passed after pinning: JPY stays valid and unknown ZZZ stays invalid. No locale library or service was introduced. `Intl` remains appropriate for presentation formatting; it no longer determines the stored schema vocabulary.

Source: [ECMA-402 AvailableCanonicalCurrencies](https://tc39.es/ecma402/#sec-availablecanonicalcurrencies).
