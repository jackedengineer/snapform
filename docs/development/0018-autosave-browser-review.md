# Autosave and local recovery integration

29 October 2026. This slice connects the existing revision-safe API to the native local recovery boundary and creator UI.

## Behavior

- Edits debounce for 750ms. One request runs at a time. Its original operation ID/body/revision remain immutable while newer edits remain independently buffered.
- An uncertain retry reuses the original operation. Confirming an older operation cannot erase newer edits. An acknowledgement that is already behind the server stops for conflict review.
- Conflicts and blocked permissions stop automatic writes. Rate limits impose a 60-second retry floor. Network failures show whether the latest definition is actually buffered locally. Storage failure is explicit; it does not fabricate offline protection.
- Navigation captures current Form API values synchronously, waits for local durability, and gives the active server save up to two seconds. If neither local nor server confirmation exists, the user must choose whether to leave. Refresh/close warns when the latest edit has not reached the local buffer.
- On return, recovery choices show independent editor copies. Selecting one preserves its original pending operation and only removes the source after the new local copy is durable. Loading the server definition preserves one alternative for restoration as a new revision.
- A session refresh network error preserves an already-loaded editor. An actual unauthenticated result closes private content. Successful sign-out stops active writers, broadcasts invalidation to other tabs, clears local authoring data and changes the cache epoch. Sign-out first prepares the active edit and requests confirmation when local copies remain. Storage failure cannot trap a user in a session; failed cleanup after remote sign-out is reported explicitly.

## Browser findings and checks

Normal: editing a question automatically saved through the real Express Worker/Neon path, and the changed description survived reload. Production preview also saved the restored agency form title and description.

Power: rapid edits, editing while a save is pending, two actual tabs, stale revision recovery, loading the server copy, restoring the durable alternative and reload were exercised. A real service outage retained the edited definition in native IndexedDB; after restart/reload it was explicitly recovered and its original operation completed. No browser-storage test double was used for this claim.

The rapid edit-then-navigate check exposed a final-keystroke race: the navigation blocker could run before React’s edit effect. A failing queue regression reproduced the missed save. Navigation now reads the live Form API values; the same browser sequence saved the exact final description before returning to the list and reopening the form.

Adversarial: two simultaneous automatic saves produced one successful revision and one conflict without replacing the loser’s local title. HTML-shaped titles remained literal in the recovery UI, with zero image elements. The strict buffer tests cover account/workspace/form mismatch, unknown properties and expiry. Existing private API tests still enforce authorization, malformed/oversized input and origin checks.

Canceling sign-out kept the account and recovery copies. After explicit approval, editing the description and immediately signing out first saved the final edit. Both actual tabs returned to login. A fresh sign-in through the workspace/form links retained that exact server-saved description, with zero local recovery choices, zero restore buttons and no cleanup warning. The production browser console reported no errors/warnings during this pass.

The recovery list was visually reviewed at desktop width 1384px and mobile widths 375px/320px, with no horizontal overflow. Controls were 68–104px high on narrow screens. The browser viewport override targeted the most recently created tab; dimensions were read from that actual document rather than inferred from the requested override. [Mobile recovery](../evidence/18-local-recovery-mobile.png) and [clean session](../evidence/19-autosave-clean-session.png) are native browser captures. The extra QA tab was closed and the viewport override reset.

## Current verification

129 unit tests, 41 workerd tests, 14 real restricted database tests and 3 real auth integration tests passed. Core contract coverage is 100% lines/functions, 99.74% statements and 99.35% branches; this is not total-app coverage. Strict types, lint and formatting passed. Production build, SSR/CSP/service-binding checks, two development API reloads/three auth cleanup cycles and the production dependency audit passed. The upstream CSS sourcemap warning remains visible.

Final measured client JS: 183.01 KiB gzip, CSS 5.01 KiB, primary font 36.07 KiB. No dependency, managed database, cloud deployment or paid service was added. No launch/SLO, screen-reader, Safari, cross-user browser or browser-eviction guarantee is claimed.
