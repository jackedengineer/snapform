# Native collection controls and executable steps

29 October 2026. The respondent controls cover text, email, declared number units, date, single/multiple choice and acknowledgment, plus heading/help content. Native labels, fieldsets, legends, input modes, autocomplete, option controls and focus indicators are retained. Optional answers can be marked refused. Public file forms continue to fail closed before this screen; the renderer does not pretend to upload files.

Page/card steps come from the shared evaluator's effective page path and applicability map. Hidden questions disappear from the steps/review; content stays with the relevant card. A behavioral step test first failed on the absent module, then passed for page/card generation and hidden-field removal. Final answers are still recomputed by the server.

The Turnstile component follows Cloudflare's explicit-render API using the vendor's official script, loaded only on demand. Sitekey configuration is public; the validation secret remains in the API Worker. Production CSP authorizes the challenge host only on `/f/` routes. Marketing/account pages retain their narrower policy. Local browser tests use the official always-pass testing widget, not a solved production challenge.

Real browser checks found a date event discrepancy: a filled date appeared temporarily but was lost on blur. The native input event now updates the recovery buffer; blur, server save, review, refresh and the actual Neon record were verified with the selected date intact. Number metadata is visible and linked in the accessible description. Native keyboard radio/checkbox selection, number/date bounds and a bypassed maxlength value were exercised. The 2,001-character input could not advance and showed its 2,000-character limit; this does not rely solely on the native HTML attribute.

Sources: [Cloudflare explicit rendering](https://developers.cloudflare.com/turnstile/get-started/client-side-rendering/), [official test keys](https://developers.cloudflare.com/turnstile/troubleshooting/testing/).
