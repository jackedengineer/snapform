# Bounded page organization

29 October 2026. Creators can add, rename, select and reorder up to ten pages, add questions/content to the active page, and move an existing block between pages without changing its identity or settings. Only an empty unreferenced page can be removed, and the final page is protected. Page reordering preserves rules; the existing compiler diagnoses any newly invalid routing rather than silently rewriting it.

The new suite first failed with the missing implementation, then five domain cases passed: independent identities/cap, empty-page removal, routing-reference protection, ordering and atomic question movement. The complete unit suite passed 139 cases with unchanged passing core coverage. Strict types, lint and formatting passed. No library, endpoint or database migration was added.

## Real browser review

Normal: renamed the original page, created a contact page, moved name/email/acknowledgment with their existing IDs and added a heading to the active contact page. Reload retained both pages and every original question/settings. Final layout: six project questions, then a heading plus three contact questions.

The first create-page check exposed a stale-selection bug: the form store already contained the new page, but the selection guard read the previous React render's page list. A failing browser assertion reproduced the incorrect active page. The guard now reads the live Form API values. Repeating creation selected the newly created page and allowed editing its own title; removal also selected the surviving neighbor correctly.

Power: keyboard reordering moved the contact page up and back down; when a move button became disabled, focus returned to the current-page selector. Reordering questions and adding content to the active page preserved the intended grouping. With fresh UI state after each action, bounded creation reached ten pages and disabled further additions. After reload, the eight empty QA pages were removed; removal stopped on the non-empty contact page, leaving both real pages and ten blocks intact.

Adversarial: HTML-shaped page titles stayed literal before and after reload, with zero image elements. A bounded owned-API probe submitted eleven pages; the real Worker returned 422 and a final read matched the original revision and complete definition. The probe's separate QA session was cleaned up. The referenced-empty-page guard is covered with synthetic rules in the domain tests; a full live rule-authoring journey is still pending the rule editor.

Production preview was reviewed at desktop width and 375px. No horizontal overflow or unlabelled controls was found; page targets measured 44–48px high. The production browser console was clean. [Desktop](../evidence/23-pages-desktop.png) and [mobile](../evidence/24-pages-mobile.png) are native captures. The temporary viewport override was reset.

Production web/API builds and SSR/CSP/service-binding checks passed. Client JavaScript is 185.81 KiB gzip, CSS 5.33 KiB and the primary font 36.07 KiB. The upstream CSS sourcemap warning remains visible. Public collection, publication, rule authoring and other market V1 features remain in progress; these authoring checks do not establish production SLOs or full accessibility certification.
