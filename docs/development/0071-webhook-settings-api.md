# Webhook settings API — 30 October 2026

The existing authenticated Express/Worker boundary now recognizes per-form
GET/PUT webhook settings and POST webhook/secret. It repeats strict shared
validation, actual workspace permissions and optimistic configuration identity.
Writes retain the existing origin/rate/body controls. Settings responses exclude
keys/ciphertext; the explicit reveal requires a matching configuration/revision,
no query parameters and a verified owner/editor session. All responses are
no-store. Neither endpoint sends a webhook or enables delivery.

Behavioral workerd tests failed first (404 instead of required 401/415), then
passed with the actual routes: anonymous GET/PUT/reveal 401, non-JSON 415,
oversized JSON 413, foreign origin 403. Full API suite: 69 pass. A restricted-Neon
rollback test verifies exact key reveal, stale revision conflict and viewer
denial. Wire projection tests reject leaked key/ciphertext, impossible enabled
states and malformed secret envelopes. Pure suite: 217 pass; 100% lines/functions,
99.67% statements, 98.30% branches. Production build/bundle checks pass; API gzip
732.93 KiB (+3.12); client JS remains 199.97 KiB. No dependency was added.

One private encryption key is configured consistently in ignored local API/Jobs
and production configuration files because they share one database. It has not
yet been uploaded to production Workers. It must be preserved with encrypted
operator recovery material; losing it makes saved destinations unavailable.
No key, URL capability or response was printed or added to Git.

This commit supplies the HTTP slice. Browser controls and their normal, power
and adversarial workflows follow before this feature is merged/deployed as usable.
Preflight, durable delivery history and retry controls remain subsequent work.
