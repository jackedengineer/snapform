# Signed recovery descriptors and private R2 copies

R2 activation was completed by the user. The new `snapform-backups` and
`snapform-purge-ledger` buckets have public r2.dev access disabled. Lifecycle
readback confirms `archives/` expiry after 30 days and `intents/` expiry after
90 days; incomplete multipart uploads under those prefixes abort after one day.
No application Worker receives a binding to the full database-backup bucket.

Version-two recovery descriptors authenticate creation time, archive filename,
encrypted size/SHA-256, table-data count and pinned PostgreSQL image. Native
HKDF derives a domain-separated HMAC key from the existing private recovery
key; AES-GCM archive framing remains version one. Canonical parsing rejects
unknown fields, unsafe paths, invalid encodings and unsigned legacy descriptors.
Restore verification rejects creation age of 30 days or more and clocks more
than five minutes in the future. A storage-only attacker cannot make an old
encrypted snapshot eligible by editing its date or copying it to a new key.

Downloaded files must match the authenticated size and SHA-256 before decryption.
AES-GCM authentication still finishes before publishing plaintext. A separate
read-only review found a prior incomplete-pair failure path: the archive was
published before manifest writing. The exporter now stages/flushes the descriptor
first, publishes it last and removes its newly linked archive on descriptor
publication failure. Existing files are preserved. Real-filesystem tests cover
that failure and successful private pair publication.

Nine offline recovery tests pass. A fresh real PostgreSQL export through the
fixed publisher verified 198,142 encrypted bytes and 23 table-data entries.
A signed copy uploaded to R2, downloaded into a private directory and passed
signature/age/hash/size verification. The downloaded copy then restored all 31
migrations and the owned synthetic dataset in a 2,000 ms local drill, preserving
typed zero/true values and actual runtime/Jobs privilege boundaries. Both roles
had no superuser/create-role/create-database/inherit/bypass-RLS/replication
attributes. Runtime saw zero unscoped responses and could not purge; Jobs could
purge but could not read auth users. Network mode was `none`, no ports were
published, and the container and plaintext were removed.

This logical drill does not establish production RPO/RTO. Deletion replay was
not exercised. Restricted automated-backup credentials/scheduling, independent
key custody, SQL-and-R2 purge replay and actual alert delivery remain open.
No migration-owner credential was uploaded to an application or CI.
