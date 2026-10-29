# Coexisting local development servers — 29 October 2026

The reload check failed because another project's HTTP server owned 8787. Its
initial configurable-port reproduction still failed: that project's Vite
inspector also owned 9230. No unrelated process was stopped. The root development
launcher and reload check now accept SNAPFORM_API_PORT, validate its integer
range, and retain 8787 by default. Wrangler's inspector uses an ephemeral port.
The direct API development command also avoids a fixed inspector collision.
Frontend/auth origin remains 127.0.0.1:5173.

`SNAPFORM_API_PORT=8797 pnpm test:dev-reload` passed two real API reloads and
three auth request/cleanup cycles. Existing source-restoration and child-process
cleanup assertions remain. This affects local tooling only, adds no dependency,
and does not change production routes, secrets or bundles.

Reference: https://developers.cloudflare.com/workers/wrangler/configuration/
