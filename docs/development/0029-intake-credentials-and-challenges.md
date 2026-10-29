# Native intake credentials and challenge verification

29 October 2026. The API now has a native Web Crypto producer for independent 256-bit URL-safe respondent credentials and SHA-256 storage hashes. Strict Bearer parsing accepts the exact credential shape, preserves token case and never falls back to an account identity. The tests first failed before implementation, then native workerd checks passed generation, exact hash lookup and malformed-header denial.

The challenge verifier uses a fixed HTTPS Siteverify endpoint, POST JSON, rejected redirects and a five-second timeout. It distinguishes invalid/replayed challenges from provider/network/protocol outages and validates production hostname/action. Official test secrets require both explicit local mode and a loopback origin; they are refused on production/non-local origins before transmission. No client-supplied testing header is used.

Three verifier cases first failed before implementation and now cover endpoint/body shape, wrong host/action, rejection/replay, non-local test-key denial and provider failure. An actual vendor call using its public dummy credentials succeeded; its response used `example.com` and omitted action. That documented development-only path accepts only known dummy metadata shapes. Production metadata checks remain strict. No production widget credential was created or exposed.

All 52 Worker tests pass, including the existing real Neon/auth/runtime cases. Types, lint and formatting pass. No SDK/package was added. These are helpers for the next session HTTP slice; they do not by themselves expose anonymous session creation, reserve quota, autosave answers or submit responses.

Sources: [server validation](https://developers.cloudflare.com/turnstile/get-started/server-side-validation/) and [official test keys](https://developers.cloudflare.com/turnstile/troubleshooting/testing/). Browser challenges will use the official local test keys; real production challenge interaction is a separate release check.
