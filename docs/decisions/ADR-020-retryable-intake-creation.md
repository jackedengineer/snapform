# ADR-020: Prepare respondent identity before creating a session

Accepted 29 October 2026. Generate a random session UUID and a native Web Crypto 256-bit bearer capability in the respondent client before sending the start request. Send the capability only in Authorization; send the UUID and Turnstile token in the strict request body. Store only its SHA-256 digest on the server. Do not return the capability or put it in URLs, logs or account cookies.

A lost creation response can be retried with the same identity and capability. The database checks the exact public/session/hash context before admission and again after locking the shared quota counter, so simultaneous retries return one pinned session and reserve one slot. A mismatched capability never adopts an existing session. Real Turnstile tokens are single-use; the client must obtain a fresh challenge token before a new creation attempt, retaining its original session identity.

The HTTP boundary accepts only POST for starts and GET for scoped reads. It applies separate native start/read rate limits, strict bounded JSON, a dedicated bearer header, no-store responses, server-side challenge verification, and the existing compilation/file-availability gates. An outer transaction rolls back an admission rejected by the file gate. Account cookies cannot substitute for respondent capabilities, and respondent capabilities cannot authenticate a creator.

Official dummy challenge keys are confined to explicit local mode on loopback origins. Production mode rejects them even on localhost. A real production widget, hostname/action checks and provider behavior must be verified before deployment; local dummy verification is not evidence of a production CAPTCHA solution.

Sources: [Turnstile server validation](https://developers.cloudflare.com/turnstile/get-started/server-side-validation/), [testing keys](https://developers.cloudflare.com/turnstile/troubleshooting/testing/), [Cloudflare local variables](https://developers.cloudflare.com/workers/local-development/environment-variables/).
