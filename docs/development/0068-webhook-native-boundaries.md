# Native webhook boundaries — 30 October 2026

First internal outbound-webhook slice: public HTTPS destination validation,
256-bit signing keys, exact-byte HMAC SHA-256 signatures and AES-256-GCM
configuration envelopes. No endpoint, sender, database migration or browser
control is exposed by this commit. Browser acceptance remains required when
those controls exist; this is not a completed webhook integration.

The signing wire format follows [Standard Webhooks](https://github.com/standard-webhooks/standard-webhooks/blob/main/spec/standard-webhooks.md):
`whsec_` keys, `v1,` signatures and `id.timestamp.raw-body` signing input.
The future transport uses webhook-id, webhook-timestamp and webhook-signature.
Verification permits a bounded list of rotating signatures, ignores unknown or
malformed candidates and checks a five-minute timestamp window. Receivers must
also deduplicate the stable event ID; signatures alone do not prevent replay.

Encryption uses fresh 96-bit IVs and authenticated workspace/form/configuration
identity. Tampering, another tenant/form/configuration, malformed authenticated
plaintext or a wrong master key fails closed without reflecting private values.
URL checks reject credentials, fragments, non-443 ports, IP encodings, private
names and Snapform's own zone. These checks do not resolve DNS. The actual sender
must use Cloudflare's [strictly public fetch boundary](https://developers.cloudflare.com/workers/configuration/compatibility-flags/#global-fetch-strictly-public),
no privileged network bindings and manual redirect rejection. Local URL tests
alone do not establish connection-time SSRF protection.

Tests failed before implementation, including rotating signatures where a bad
candidate previously hid a valid later candidate. Independent Node HMAC/AES
references and actual workerd Web Crypto checks pass. Full pure suite: 215 tests,
100% lines/functions, 99.66% statements, 98.26% branches; Jobs Worker: 20 tests.
Formatting/types/lint pass. Production build and bundle checks pass: 199.97 KiB
aggregate client JS; home 119.34, collector 160.11, editor 182.37, inbox 158.42;
CSS 7.85 and primary font 36.07 KiB. API/Jobs bundles remain 729.81/219.83 KiB gzip.
No dependency or runtime entry-point import was added; no database/provider
writes, network probes to private targets or browser feature claims were made.

Review covered exact-byte signatures, canonical base64 bounds, timestamp limits,
constant-time native HMAC verification, fresh IVs, authenticated context and
constant error messages. There is no custom crypto algorithm, SDK or new layer.
The forthcoming sender still needs immutable configuration/payload snapshots,
durable attempts, explicit preflight/enable controls, safe retry and browser QA.
