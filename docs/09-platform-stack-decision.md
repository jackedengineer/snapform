# Current platform decision

**Accepted:** 28 October 2026. [ADR-012](decisions/ADR-012-express-workers-native-first.md) supersedes the earlier Fastify/container and alternate-cloud recommendations. [Technical foundation](03-technical-foundation.md) is the current full specification.

- React + TanStack Start/Router/Form/Query for frontends; use other TanStack modules only when needed.
- TypeScript + Express 5 through the Node HTTP bridge on Cloudflare Workers. Node LTS is the build/development toolchain; workerd is the deployed runtime.
- Neon managed PostgreSQL + Drizzle and request-scoped Hyperdrive transport.
- Better Auth/Neon for identity; private R2 for objects; Queues/Cron with a Neon outbox for durable jobs.
- Razorpay using the existing account; Resend for email; bounded AI in its later phase.
- Native browser/language/platform APIs first, measured dependency cost, no unnecessary abstraction, focused automated tests and three-mode real-browser verification.
- No alternate-cloud fallback. Cloudflare-only native scanner feasibility remains a file-release gate.

The earlier alternatives and local compatibility results are historical evidence, not active implementation choices. The Express probe passed nine local cases; it did not prove hosted database/auth/payment/queue integration. No provider account was changed during research.
