# ADR-014: One Neon client per Worker request

Accepted 28 October 2026. Supersedes the initial request-local Pool implementation, without changing Neon, Drizzle, the single database or the nonadministrative runtime role.

Browser signup/recovery exposed an unhandled connection-close error after a successful HTTP response. Holding the Express completion through `waitUntil` was necessary but insufficient. The driver's pool shutdown removes clients from its internal collection before each connection's disconnect event. A focused real-workerd regression failed: `close()` resolved while neither Client `end` nor Pool `remove` had fired.

Use one native Neon `Client` per request, explicitly await `connect()`, and await its actual `end()` in `finally`. Drizzle interactive transactions stay on that connection. The Express completion is registered with `waitUntil` before database work can yield. Connection errors are logged as fixed events, without URLs, SQL parameters or provider diagnostics; failures before headers receive a sanitized response. A negative-login test then caught the driver’s default optimistic connection pipelining: connect could resolve before authentication failure. Per-client pipelineConnect is false so readiness means the server has authenticated the connection. No pooling wrapper, proxy or custom cryptography was added. Low launch traffic does not justify a pool that can contain only one connection.

The disconnect regression now passes with actual Neon inside workerd, alongside identity, rollback and transaction tests. The isolated dev test also performs repeated real auth HTTP requests after API reloads and checks for lifecycle failures. CI prepares private runtime configuration with dummy mail credentials for this read-only auth check; no live mail key is available to CI.

Sources: [Neon Client lifecycle](https://neon.com/docs/serverless/serverless-driver#pool-and-client-usage-notes), pinned driver 1.2.0 Client/Pool implementation, [Cloudflare execution context](https://developers.cloudflare.com/workers/runtime-apis/context/).
