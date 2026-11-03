# Focused form studio

The editor opens on questions. Build, Settings and Publish & share separate writing from configuration while preserving local component state and autosave. Desktop types are one-click; a phone picker closes after insertion and focuses the new label. Questions and duplicates insert after the selection, with independent form-wide limits of 50 answers and 100 content blocks. Unsupported file collection is not offered as a new type. Existing file drafts remain readable.

Design Taste framed-sheet direction retains the brand and font. CSS supplies quiet tinted chrome, a white editing sheet and 140ms feedback; no package added. All integration controls, recovery and server authorization remain in place.

## Verification, 3 November 2026

- Three insertion tests first failed on the missing implementation, then passed. Full pure suite: 260 tests / 59 files; coverage statements 99.19%, branches 97.68%, functions 100%, lines 99.84%.
- Actual API workerd boundary: 95 tests / 27 files passed, including malformed and unauthorized request cases. No database schema/runtime change.
- Format, strict types, lint, production build and Worker dry runs passed. Production audit: no known vulnerabilities.
- Local IAB normal journey: created synthetic Form studio revamp — QA, added/renamed questions, saved and reloaded. Publication status reachable in one click without an additional disclosure click.
- Power journey: keyboard Build activation, mobile picker, insertion between questions, duplicate, move down, tab switching and reload. IDs and order retained. Reload during a save preserved the local recovery copy as designed.
- Adversarial UI: HTML/event-handler text remained literal with no injected image. API boundary abuse tests supplement the browser check; no attacks on third-party services.
- Responsive: 390×844, 768×1024 and 1440×1000. Found and fixed inherited mobile grid overflow; document width now equals viewport. Read-only DOM checks found zero visible unlabelled controls, unnamed buttons or duplicate IDs in the studio. Manual focus lands in new question label. This is not a full screen-reader/WCAG audit.
- Console contained an earlier development hot-reload context warning; saved editor reload succeeded. Final clean-load console review remains part of the whole-revamp gate.
- Measured build: editor 183.98 KiB gzip JS, all JS 214.13 KiB, CSS 10.48 KiB, primary font 36.07 KiB. Final disabled-state/copy adjustments are included in the successful build gate. These are artifact sizes, not production latency measurements.

Review: no new trust boundary or dependency; capped insert helper is pure; hidden settings keep unsaved state. Mobile picker, duplicate cap and validation links were reviewed for reachable focus. The full revamp is still in progress per the specification; this slice is not a complete product release.
