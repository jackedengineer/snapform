# Patched local Worker tooling

1 November 2026. Updated only the direct Cloudflare Vite plugin from exact 1.65.0
to 1.66.0. Its supported Miniflare dependency now shares the existing
5.20261023.1-beta / Undici 7.30.1 / workerd 1.20261023.1 path with Wrangler and the
Worker test plugin. The generated lockfile removes the vulnerable older Undici
and duplicate runtime path; no package override or audit suppression was added.

The full audit's four high findings are gone. One moderate development-only
`minimatch` glob-amplification advisory remains under ESLint. The latest ESLint
10.14.0 still requests major 10; the maintainer lists its fix in major 11. A
targeted supported-range refresh found no compatible update. Do not force an
unreviewed major override to hide this finding. Production dependencies are clean.

The plugin also changes Worker registry defaults. The existing actual
`test:dev-reload` failed to reach the bound API after the update. A checkout-local
`CLOUDFLARE_DEV_REGISTRY_PATH` is now passed to both Wrangler and Vite; the same
test then passed two API reloads and three real auth/cleanup cycles. Other local
projects cannot supply Snapform's binding through the shared default registry.

No app runtime dependency is added. The primary browser chunks and emitted
artifact sizes remain unchanged after the production build. Preview SSR, CSP
nonce, private service binding and provider callback checks pass.

All 84 API, 42 Jobs, 240 core/coverage and 44 recovery tests pass, along with
formatting/types/lint. Browser JS remains 208.05 KiB gzip, CSS 8.59 KiB and primary
font 36.07 KiB. In-app browser on the real local Worker loaded the existing
synthetic collector and recovered its draft. Forward/back navigation, a rejected
negative budget, keyboard focus, one main landmark, no horizontal reflow and a
clear error/warning console were checked. This was a tooling regression check,
not a new complete submission or a replacement for feature-specific journey QA.

Primary sources: [Cloudflare's 1.66.0 release](https://github.com/cloudflare/workers-sdk/releases/tag/@cloudflare%2Fvite-plugin@1.66.0),
[Undici 7.30.1 security fixes](https://github.com/nodejs/undici/releases/tag/v7.30.1),
[Minimatch advisory](https://github.com/isaacs/minimatch/security/advisories/GHSA-g3hv-75wg-m249).
