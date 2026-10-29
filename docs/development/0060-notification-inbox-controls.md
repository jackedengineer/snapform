# Notification controls and delivery history — 29 October 2026

The inbox has a native disclosure with an explicit future-only owner opt-in and
the latest twenty delivery summaries. Opening it loads settings; the initial
inbox does not wait for that request. The shared request boundary validates both
directions, uses revisioned writes and rejects arbitrary recipients before fetch.
Client queries are scoped by verified user/workspace/form. Server authorization
remains the security boundary. Acceptance, mail-server delivery and reading are
distinct in the interface. Manual repair and signed provider receipts still follow.

The new client request test failed before implementation and passes afterward.
Normal browser checks at actual 320×812: default off, opt-in, no historical
backfill, one new synthetic collector submission with budget zero, one pending
notification with zero attempts, opt-out cancellation, and a history link opening
the matching response. Re-enabling preserved cancellation. No live email was sent;
the deployed jobs Worker still runs transport-only code. The owned QA setting was
restored to off. QA metadata is saved privately; no answers enter Git.

Power-user checks: disclosure/toggle/refresh by keyboard, focus during/after saves,
repeated activation, reload and saved-state recovery. The first keyboard run lost
focus because the pending native button became disabled. Busy controls now keep
focus with aria-disabled and block repeated actions; actual focused text stayed
Saving/Refreshing and then the settled action. Three rapid Enter presses changed
the saved revision once (4 to 5), confirmed by a read-only database check, and did
not replay the cancelled delivery. Opt-out then saved revision 6.

Adversarial browser navigation with a recipient override returned only
INVALID_NOTIFICATION_SETTINGS; actual authenticated Worker probes also cover
malformed flags/revisions, stale updates, unknown queries, foreign origins and
unrelated tenants (slice 0058). The existing response answer view still renders
zero correctly. No horizontal overflow at 320 or 1280px. DOM accessibility checks
at 1280×720 found one main landmark, zero duplicate IDs, zero unnamed visible
controls and a visible summary focus outline. Console warnings/errors were empty.
Screenshot 51 shows an empty owned inbox and contains no answers. A full mobile
device or screen-reader run is not claimed. Viewport reset did not resize an
existing narrow tab; a fresh default tab supplied the verified desktop width.

The first build exceeded 200 KiB JS. React and TanStack modules already loaded by
the root are now grouped together; editor/form modules remain lazy. The homepage
static import graph measures 118.28 KiB gzip and excludes inbox/editor modules.
Final assets after accessible label spacing: 199.92 KiB JS gzip,
7.85 KiB CSS and 36.07 KiB font. No threshold or dependency changed. These are
artifact sizes, not production latency or interaction percentiles.

The 201-test pure suite and production SSR/export preview checks pass. The
development reload check also passed with SNAPFORM_API_PORT=8797 after the
separate local-port fix (slice 0061); no unrelated server was stopped. Strict
checks run through the commit hook. Provider receipts, live email, safe manual
repair and signed outbound webhooks remain unfinished integration work.
