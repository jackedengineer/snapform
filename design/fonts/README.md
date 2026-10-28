# DM Sans font assets

Foundation 0.2 uses DM Sans Variable, normal style, weights 100–1000, with system fallbacks. Fontsource supplies the font files; no Fontsource runtime dependency is installed in this project.

- Package: `@fontsource-variable/dm-sans@5.3.0`, retrieved 28 October 2026 from the npm registry with `npm pack`.
- Package integrity: `sha512-BpUG5bqePiDFMBM4ZtLSlPdAIOM990uB1dlXzIf4aw21yQR7BmykedLXXXMqGWsR18aMLOsbWccwJNh3ztTQaA==`.
- `files/dm-sans-latin-wght-normal.woff2` → `dm-sans-latin-variable.woff2`: 36,932 bytes.
- `files/dm-sans-latin-ext-wght-normal.woff2` → `dm-sans-latin-ext-variable.woff2`: 18,228 bytes.
- Both subsets combined: 55,160 bytes. CSS Unicode ranges avoid loading Extended for basic Latin-only copy.
- License: SIL Open Font License 1.1. Keep [OFL.txt](OFL.txt) with redistributed font assets. The license permits embedding and redistribution under its conditions; do not sell the font by itself.

References: [Fontsource usage](https://fontsource.org/fonts/dm-sans/use), [Google Fonts specimen](https://fonts.google.com/specimen/DM+Sans), [upstream license](https://github.com/google/fonts/blob/main/ofl/dmsans/OFL.txt).

The specimen uses `@font-face` and `font-display: swap`. Product implementation can use the same assets through the framework's local font support. Measure fallback layout shift and actual collector bundle cost before launch. Do not add a third-party font request just to reproduce this specimen.
