# Editable starting points

Four native buttons create project enquiry, coaching discovery, client intake and customer feedback forms. Blank form stays a direct action. Starters use fresh IDs on every creation, compile through the same contract and remain fully editable. Feedback contact is optional. The server-validated creation result populates the account-scoped draft cache with a one-second freshness window; no optimistic permission claim is used. Creation retry keeps the original operation identity and disables alternate starter choices until it is resolved.

Data/privacy controls move into a native disclosure, while the workspace deletion status still gates creation outside that disclosure. The form list no longer labels every form Draft, because the list endpoint does not supply publication status.

Three starter tests were written first; both module-missing and optional-contact failures were observed before the implementation passed. Browser: agency starter created and renamed at 768px; feedback starter created by Enter at 390px, email confirmed optional; creation actions disabled while pending; privacy disclosure exposed the existing retention and deletion controls. Mobile document width matched 390px. HTML-injection display and API boundary malformed/permission tests from the preceding slice still cover the unchanged draft boundary. No new network destination or dependency.

Final automated/build measurements are recorded with the whole-revamp verification. No real customer information was used. No claim of real-device, screen-reader or production latency testing.

Slice gates passed: format/types/lint, 265 unit tests (including the next isolated preview helper), web build and bundle checker. Workspace route 165.14 KiB, editor 184.00 KiB, total JS 214.92 KiB, CSS 10.68 KiB gzip. Review checked idempotent retry, account-scoped cache, deletion gating, fresh IDs and honest publication labels.
