# Verified foundation preview deployment

1 November 2026. Deployed the clean `4e6e2bfb3185b8435778bae45ceb63b15beaad74`
main tree to `https://snapform.jacked.dev`. Its contents match the exact-head
CI-verified PR 41 tree; rebase merge retained the six focused commits. The clean
deployment worktree passed production build and bundle gates. Jobs, then API,
then web were deployed. No secret, recipient restriction, live charge or active
retention setting was changed.

| Worker | New version                            | Previous verified rollback version     |
| ------ | -------------------------------------- | -------------------------------------- |
| Jobs   | `22e40d93-5d73-46b5-8097-c39da62db95d` | `f74ed723-08bd-495a-b093-951bd6d08114` |
| API    | `934f3902-4cfa-405a-bb9c-496c0f5ac587` | `6ac69465-f06f-4a4f-9454-390869d17ca0` |
| Web    | `dbf85a21-33f5-4e15-ae00-5fda8b944acf` | `a6e40b7e-5754-4c92-9be0-b2192122becd` |

Health, support, privacy and abuse routes returned 200 with no-store, HSTS and
CSP. All three information pages contain the configured public contact. The
in-app browser recovered an existing synthetic submitted receipt after reload,
showed the new help/privacy links, and opened the deployed support page. The
receipt console was clear; private screenshot:
`.recovery/production-receipt-preview.jpg`. This is receipt recovery, not a fresh
production challenge/submission test. The local complete intake and real
production Incognito submission evidence remain recorded separately.

Database migrations through 37 are applied. Rollback of a Worker does not revert
those additive SQL changes. Follow the version-specific rollback commands in the
deployment runbook and verify receipt recovery, owner access and callback paths.

This remains a private preview. Scheduled purge wiring in 0113 is a later,
undeployed slice with activation off. Owner deletion controls, authenticated
restore replay, independent key custody, alerts and final production performance
measurements remain release gates. HTTP health is liveness; it does not prove all
dependencies or the unmeasured production SLOs.
