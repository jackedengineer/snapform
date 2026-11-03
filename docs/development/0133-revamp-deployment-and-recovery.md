# Revamp deployment and creation recovery

3 November 2026. PR 52 merged four focused UI commits as main
`019f2d718888a230252b0fd3438207fc1cf9963c`. The clean release checkout matched
that tree and passed `pnpm check`; hosted Verify run `41621942221` passed every
step. Clean-release counts: 264 pure tests, 89 API runtime tests, 43 Jobs tests,
65 rollback-only database tests and three auth integration tests. Recovery,
format/types/lint, build, bundle, built Worker preview, dev reload and dependency
audit also passed. The larger development-checkout counts in 0132 include
separate operations work and are not the release counts.

## Deployment correction

The first web smoke test found a real release-order mismatch. The previously
deployed API did not expose the already-merged deletion-status route, so the new
workspace correctly refused creation. Web was rolled back immediately to
`dbf85a21-33f5-4e15-ae00-5fda8b944acf`. Review of the API delta found the merged
deletion and retention routes; its configuration was unchanged, and the new SQL
functions were already present and verified by the database suite.

The compatible clean-main API was deployed first, then the verified web version:

| Worker | Verified version | Previous rollback version |
| --- | --- | --- |
| API | `444929d0-a4b4-42db-85e5-d4a11e6cfd6d` | `934f3902-4cfa-405a-bb9c-496c0f5ac587` |
| Web | `a8f0b727-60fc-4d0f-9e23-2d6fb9c810a8` | `dbf85a21-33f5-4e15-ae00-5fda8b944acf` |

Roll web back before API if reverting this pair. No migration, Jobs deployment,
purge activation, secret change, billing action or alert/backup change occurred.
The application remains a private preview; this UI release does not complete
the separate operations launch gates.

## Actual production browser results

- Normal: interactive landing sample, coaching-starter creation, title autosave,
  in-memory preview, public card collection, review, durable submission, inbox
  detail and native CSV download succeeded on `snapform.jacked.dev`.
- Power: keyboard preview, Escape returning focus to Preview, editable review,
  response-view switching, publication controls and reversible collection stop.
- Adversarial: malformed preview email was rejected with focus on the field;
  an HTML/event-handler string stayed literal in respondent and stored owner
  views, with zero injected images. Unauthenticated deletion reads and unsigned
  provider callbacks returned 401 through the deployed Worker boundary.
- Preview left the new coaching form's inbox empty. A real synthetic collector
  submission produced one new receipt and its matching inbox record. Export had
  three rows including the header, 13 consistent columns and the expected ID.
  The synthetic project-enquiry collector was stopped afterward; data was kept.
- Mobile editor/inbox document width equalled the 390px viewport. These are
  desktop browser viewport checks, not real-device or screen-reader certification.
- No application-origin production console error was observed. Cloudflare's
  challenge iframe emitted opaque diagnostic warnings/errors; its verification
  and submission still completed. No warnings were suppressed.
- Home and health returned 200 with no-store and HSTS; HTML retained nonce CSP.
  Liveness and artifact budgets do not establish production latency/Web Vitals.

## Follow-up: visible creation recovery

The deployment mismatch also exposed a UX issue: a failed status check disabled
creation while its explanation was inside collapsed Data and privacy controls.
The workspace now shows a fixed explanation and retry action beside creation
when those controls are closed. The safety gate remains intact; raw diagnostics
are not rendered there. The SSR regression fails on the prior rendering and
passes with this change, using a real failed TanStack Query entry.

A temporary local-only 503 for the owned synthetic workspace reproduced the
failure through Express in the in-app browser. The message was visible without
opening settings; keyboard retry remained fail-closed while the fault persisted.
Removing the fault restored creation controls. The injected API lines were
removed and the API diff verified empty before build/commit. No production fault
was injected. Screenshot evidence remains private in `.recovery/`.

This follow-up's final deployed web version and hosted checks are recorded in
its pull request. The API version above remains the compatible baseline.
