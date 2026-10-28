# Native authoring recovery boundary

29 October 2026. The browser cache stores form definitions, not sessions, credentials, or respondent answers. Neon remains the single managed application database.

Each versioned record is scoped to the verified user, workspace, form and editor instance. Shared strict validation rejects unknown properties, unsupported definitions, mismatched pending-operation revisions, mismatched identities, future timestamps and records seven days old. A pending operation retains its original ID, expected revision and body independently of newer edits. Different editor instances have independent keys.

IndexedDB supplies ordered transactions without another library. Reads prune expired/invalid records within the selected scope and refuse more than 100 current recovery copies. Storage failures are surfaced rather than replaced with a fake successful cache. Successful online saves remain possible if local storage fails. Each mutation checks a cache epoch in the same transaction; clearing the cache changes that epoch so an older connection cannot refill it afterward. Connections close on editor cleanup and database version changes.

## Verification

- The new boundary tests first failed with the missing implementation, then passed for identity, expiration, strict input, independent editor keys and pending-operation immutability.
- Real in-app browser testing stopped both local services, edited the loaded application, observed the local-only save state, restarted services, reloaded and explicitly recovered the IndexedDB copy. Its original pending save completed against real Neon and survived another reload.
- Two actual tabs produced one successful save and one conflict. The conflicting local version survived reload. Loading the server copy retained the alternative; that backup also survived another reload.
- HTML-shaped text in a recovery title rendered literally, with zero image elements and no horizontal overflow at 375px.
- Browser sign-out cancellation preserved the account/editor and recovery choices. Completing the destructive local-copy cleanup check is pending explicit approval; it is not claimed as verified here.

The cache is an aid to recovery, not a guarantee against browser eviction, disk failure or clearing site data. Fresh authentication still requires a connection; no offline application shell or service worker was added. There is no new runtime dependency.

The related queue and UI integration are separate focused commits. The market V1 and production release gates remain in progress.

Sources: [IndexedDB transactions and their scheduling](https://developer.mozilla.org/en-US/docs/Web/API/IDBTransaction), [TanStack navigation blocking](https://tanstack.com/router/latest/docs/guide/navigation-blocking). Runtime behavior was also checked against the installed pinned TanStack Router source.
