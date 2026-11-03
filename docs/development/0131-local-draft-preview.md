# Preview before publishing

The editor offers a native modal preview using the real field renderer, form evaluation and page/card step builder. Answers live only in component memory; there is no intake controller, session creation, transport, storage or submission call. A distinct Finish preview action displays the configured completion message with an explicit non-submission notice. Closing destroys preview answers. Settings opens its main disclosure without another click.

Two pure preview-state tests failed before implementation, then passed: required email gating, valid answer advancement, stale step fallback, card order and invalid-definition rejection. Existing evaluator/step suites cover branching and hidden answers.

Browser checks on the synthetic Project enquiry — revamp QA draft:

- Normal: page preview, required email error, valid completion; response inbox remained empty.
- Power: one-question mode, Continue/Back preserving the prior answer, Escape returning focus to Preview, Enter reopening, fields reset on reopen.
- Adversarial: malformed email rejected; HTML/event-handler answer remained literal with zero injected images. No third-party actions or real customer data.
- At 390×844 the dialog remains within the viewport and scrolls independently; at 1440×1000 it is a centered sheet. Native modality isolates the background and focuses the heading.
- Browser reproduction found immediate dismissal during React development effect replay: cleanup closed the dialog and queued onClose. Fixed by opening only when closed and relying on DOM removal to release modality. Repeated open/Escape/reopen passed after the fix.

Types, lint, formatting, web production build and artifact checks passed. Editor 186.11 KiB; total JS 215.99 KiB; CSS 11.37 KiB gzip. No dependency added. Review checked the portal avoids nested HTML forms, preview submit stops propagation to editor autosave, answers cannot escape via a transport, and custom completion text is explicitly framed as a preview. This does not replace a screen-reader or real-device audit.
