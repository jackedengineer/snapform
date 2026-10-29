# Router bundle sharing — 29 October 2026

The publication UI exceeded the existing aggregate client-JavaScript budget at
201.30 KiB gzip. Grouping only Zod or React did not improve it. The retained
configuration groups TanStack router and client-start runtime modules, which
are already required for application navigation. Feature routes remain split.
No dependency, minification exception, browser target or budget changed.

The final publication build measures 199.53 KiB JS, 6.97 KiB CSS and 36.07 KiB
primary font. Largest chunks: application entry 63.64 KiB, router 52.20 KiB,
validation 25.22 KiB, form runtime 13.68 KiB and editor 12.39 KiB (gzip).
This leaves little aggregate headroom; later features still have to pass it.

Verified: production build; SSR, unique CSP nonce and Express service binding;
two development reloads and three auth cleanup cycles; 177 existing unit,
62 Worker, 26 rollback-only database and three auth integration tests; production
dependency audit. Publishing and collector recovery were exercised through the
real browser. The known upstream CSS sourcemap warning remains; no runtime
console warnings/errors were observed on the publishing tab.

Configuration references: [Rolldown code splitting](https://rolldown.rs/reference/OutputOptions.codeSplitting)
and [Vite build options](https://vite.dev/config/build-options).
