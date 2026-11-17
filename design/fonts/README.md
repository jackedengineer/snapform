# Geist font assets

The Clear identity ([ADR-025](../../docs/decisions/ADR-025-clear-identity.md)) uses Geist Variable, normal style, weights 100–900, with system fallbacks. No font runtime dependency is installed.

- Source: the `next@16.4.2` npm package, files `dist/esm/next-devtools/server/font/geist-latin.woff2` and `geist-latin-ext.woff2`, copied from the local pnpm store on 17 November 2026. They are Google Fonts' Geist subsets, version 1.401, with a `wght` axis of 100–900 (read from the fonts' own `name` and `fvar` tables).
- `geist-latin-variable.woff2`: 28,356 bytes, SHA-256 `1b5ebfb3a01a97343ac96873e6d59a8cb285c66012b6a1ac509cb2765e995ba8`.
- `geist-latin-ext-variable.woff2`: 15,292 bytes, SHA-256 `f7604a53a00250f66db4b47dd44327ce2a43f6edec850d5217bb80238819efdd`. It carries ₹ and other Extended characters; the CSS Unicode ranges load it only when such a character appears.
- Both subsets combined: 43,648 bytes, 11,512 bytes less than the DM Sans files they replace.
- License: SIL Open Font License 1.1, copyright 2024 The Geist Project Authors. Keep [OFL.txt](OFL.txt) with redistributed font assets; the web app ships the same text as `geist-license.txt`. The license permits embedding and redistribution under its conditions; do not sell the font by itself.

References: [Geist repository](https://github.com/vercel/geist-font), [Google Fonts specimen](https://fonts.google.com/specimen/Geist), [Open Font License](https://openfontlicense.org).
