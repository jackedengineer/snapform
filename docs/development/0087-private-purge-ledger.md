# Private recovery ledger foundation

The recovery ordering requires an immutable encrypted intent before content is
physically removed. This slice implements that boundary without enabling the
scheduled purger or claiming that retention/deletion controls are available.

Strict metadata accepts only intent/workspace/target UUIDs, response/workspace
kind, expiry/owner reason and an ISO creation timestamp. Answers, credentials,
email addresses and unknown keys are rejected. Native Web Crypto AES-256-GCM
uses a random 96-bit nonce, authenticated format/domain and intent ID. Use a
dedicated ledger key, separate from webhook and full-database backup keys.
Malformed, oversized, wrong-key, tampered and swapped-identity envelopes fail
with fixed errors. Neither the content nor key is logged.

Native R2 `If-None-Match: *` writes cannot replace an existing intent. A losing
concurrent write decrypts the existing record and checks all metadata. Conflict
or corruption blocks finalization. A bounded batch persists each intent before
calling SQL finalization; storage failure prevents that call. A crash after the
ledger write can retry the same intent without overwriting it. The caller must
treat any failed count as an operational failure, not successful completion.

The failing missing-module tests preceded implementation. Pure tests cover
encryption and strict inputs; real workerd/R2 tests cover concurrent conditional
writes, idempotent retries, conflict/corruption/size bounds, crash recovery,
empty/bounded batches and database/storage errors. These tests use local R2 and
synthetic metadata; no production bucket or real response is deleted.

The planned Jobs binding is `PURGE_LEDGER` / `snapform-purge-ledger`. Its private
remote bucket, lifecycle, secret and restore replay must be configured before
deployment or activation. Cloudflare's billing handoff is still pending. The
current production Jobs version is unchanged. No generic adapter, new package,
public bucket route or access to full authentication backups is introduced.

References: [R2 conditional writes](https://developers.cloudflare.com/r2/api/workers/workers-api-reference/#conditional-operations),
[PostgreSQL queue-style row locking](https://www.postgresql.org/docs/current/sql-select.html#SQL-FOR-UPDATE-SHARE).

Verification: 234 pure tests pass, with 99.83% lines, 100% functions, 99.29%
statements and 97.82% branches across the implemented pure contracts. All 36
Jobs tests pass in workerd, and production builds/bundle checks pass. The web
bundle is unchanged because this foundation is server-only and not activated.
