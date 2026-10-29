# Outbox leases and job authority — 29 October 2026

Migration 0016 creates a dedicated `snapform_jobs` role and fixed-search-path
dispatch commands. The bootstrap enables its login once and writes only a
private mode-0600 job configuration; reruns preserve existing credentials.
The role has no superuser/create/inherit/bypass capabilities, direct auth or
response-content reads, table dispatch updates or schema creation. The app
runtime cannot execute the dispatch commands. This actual privilege test failed
before setup and passes afterward.

Claims use `FOR UPDATE SKIP LOCKED`, bounded batches of at most 20, fresh fencing
tokens and two-minute leases. Queue confirmation requires the current unexpired
token; lost/failed publication backs off. A dispatched but unacknowledged event
becomes eligible again after an hour, independent of Queue retention. Completion
is recorded idempotently. These are transport receipts; provider notification
delivery is not implemented or claimed by this slice.

A real two-connection job-role probe targeted only the owned synthetic browser
event. Competing claims returned no duplicate lease; wrong tokens could not
confirm dispatch; failed dispatch delayed retry; repeat acknowledgment returned
already-completed. A separate operator transaction expired only that QA event's
lease and proved reclamation plus rejection of its old fencing token. Every
probe mutation rolled back, leaving the event pending for real transport tests.
No test database, additional Neon branch or raw-answer logging was used.

Queue messages contain only `{version:1,eventId}`. A strict contract rejects
invalid versions/identities and extra answer/capability fields. Its test failed
before implementation and passes afterward. Formatting, types and lint pass;
no new dependency or client feature is included. Real Queue relay/consumer and
provider side effects remain the next integration work.
