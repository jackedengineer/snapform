# Isolated Chrome production smoke — 30 October 2026

## Scope and method

The user explicitly authorized REA isolated Chrome for Snapform QA. REA performed
bounded declared actions against `https://snapform.jacked.dev`, using fresh,
provider-owned temporary profiles. Chromium reported `156.0.8078.76`; every
completed scenario reported `cleanup: terminated-owned-process`. Reduced motion
was enabled. No logged-in third-party dashboard was accessed.

This pass checked the deployed connection-cleanup fix on the existing synthetic
QA account/form. API deployment: `6ac69465-f06f-4a4f-9454-390869d17ca0`;
Jobs: `f74ed723-08bd-495a-b093-951bd6d08114`;
web: `a6e40b7e-5754-4c92-9be0-b2192122becd` (deployment identities supplied by
parent release verification, not inferred from the browser).

Network request/response bodies, header values and storage capture stayed off.
No response detail was selected and no raw answers or CSV were captured.
No form submission, password reset, email, webhook test/retry, settings mutation
or data deletion was performed. The protected pass created a normal QA login
session and signed it out before browser termination.

## Actual checks

| User mode / viewport       | Expected                                                                                                             | Observed                                                                                                                                                                                                                                                                                                                                      | Evidence               |
| -------------------------- | -------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------- |
| Normal, 1280×800           | Home loads with readable hierarchy and working sign-in navigation                                                    | Home document/assets returned 200; hero and CTA fit. Clicking the header sign-in reached the labeled login form. No console/page errors.                                                                                                                                                                                                      | E1, E2; screenshots 64 |
| Normal, 375×812            | Malformed email receives actionable feedback without an authentication request                                       | `not-an-email` produced “Invalid email address”; no auth POST. Visible focus outline and error border fit the viewport.                                                                                                                                                                                                                       | E3; screenshot 65      |
| Normal, 375×812            | Published QA collector opens safely                                                                                  | Public definition/config GETs succeeded; privacy/recovery text and disabled start CTA rendered. Turnstile remained “Verifying” after the three-second observation. No Snapform POST occurred.                                                                                                                                                 | E5; screenshot 67      |
| Normal, 1280×900           | Verified QA login opens inbox and integration settings; sign-out returns to login                                    | Sign-in, account, response-list, notification and webhook-settings reads returned 200. Both settings panels loaded; no setting changed. Inbox retained “Select a response.” Sign-out returned 200 and the login form became visible. No console/page errors.                                                                                  | E12; screenshot 68     |
| Power, 320×740             | Skip link works by keyboard and narrow content stays readable                                                        | Enter on the skip link changed URL to `/#main` and moved the viewport to main content. Heading and CTA stayed within the visible width.                                                                                                                                                                                                       | E4; screenshot 66      |
| Power, 375×812             | Keyboard controls communicate state                                                                                  | Tab/blur exposed email/password validation. Space toggled empty password visibility to “Hide password [pressed]” and back to “Show password”. Enter on password-help opened the reset-request page; nothing was submitted.                                                                                                                    | E6, E8                 |
| Power, 1280×900            | Integration panels and refresh work by keyboard without mutation                                                     | Enter opened/closed email and webhook details. “Refresh saved endpoint” and keyboard inbox Refresh issued successful GETs and preserved the no-selection inbox. Sign-out completed.                                                                                                                                                           | E12                    |
| Adversarial, 375×812       | Injection-shaped email stays inert and invalid                                                                       | An HTML-shaped email remained input text, showed the validation error, issued no auth POST or `/x` request and raised no page error.                                                                                                                                                                                                          | E6                     |
| Adversarial, 375×812       | Anonymous private route exposes no inbox/answers                                                                     | Direct private-inbox navigation showed “Let’s get you signed in.” Account GET returned expected 401. The explicit sign-in link worked.                                                                                                                                                                                                        | E7                     |
| Adversarial, 375×812       | Malformed and unavailable form IDs fail safely; retry remains usable                                                 | Malformed ID returned a friendly 404 page. A valid unknown ID settled to an unavailable-form alert; Enter on Retry repeated the GET and returned the same alert (two expected 404s), with no answer data or JS page error.                                                                                                                    | E9, E10                |
| Power/adversarial, 375×812 | Keyboard login opens the authorized inbox; an unowned/unavailable workspace ID fails closed; sign-out removes access | Keyboard sign-in and authorized response-list GET returned 200. Navigation with a different synthetic workspace ID returned 404 and “That workspace or form is unavailable.” No response list/details appeared. Keyboard sign-out returned 200; revisiting the original inbox returned account 401 and the sign-in prompt. No JS page errors. | E14                    |

Three protected requests were cancelled with `net::ERR_ABORTED` during deliberate
navigation/panel closure: workspace-list, publication and webhook-delivery reads.
Completed inbox/settings requests returned 200. These cancellations were not
reported as a successful read or a product failure. Expected anonymous 401 and
unknown-form 404 resource console messages are separate from JavaScript errors.
The alternate-workspace test used a synthetic unavailable UUID, not an existing
second workspace, so it does not establish a complete cross-tenant test matrix.

## Screenshots inspected

- [64 — desktop home](../evidence/64-isolated-chrome-home.png)
- [65 — mobile login validation/focus](../evidence/65-isolated-chrome-login-validation.png)
- [66 — 320px home after keyboard skip](../evidence/66-isolated-chrome-home-320.png)
- [67 — mobile public collector landing](../evidence/67-isolated-chrome-collector-375.png)
- [68 — desktop inbox with no selected response](../evidence/68-isolated-chrome-inbox-desktop.png)

## Protected-input verification and evidence handling

A nonsecret marker proved that literal password fill values are **not** safely
redacted from the whole REA evidence envelope: action parameters and captured
DOM/accessibility retained the marker (E11). No real credentials used that path.

The already installed REA 6.5.0 CLI supports:

```text
/Users/jackedengineer/.local/bin/rea capture-browser-scenario /tmp/<scenario>.json --format json --full-output
```

An isolated Node child supplied a second nonsecret marker through only its own
environment. The scenario declared `secrets: [{environment_variable, secret_id}]`
and filled with `{source: "secret", secret_id}`. All steps completed; the entire
stdout/stderr lacked the marker, and captured DOM/accessibility explicitly used
`[REDACTED:synthetic-password]` (E13). Only after this proof did the protected
scenario load the private QA email/password into child-only environment values.
The entire real-credential output was checked for both values before inspection;
neither appeared as text. No MCP/global environment or service was reconfigured.

The first protected run accidentally enabled per-step screenshots. Unwanted local
login-step images were neither viewed nor exported, and the owned full temporary
output was discarded after extracting only the safe collapsed inbox screenshot
and sanitized metadata. No credential, session capability, sensitive header,
raw answer or login screenshot was added to repository evidence. Further
protected checks use URL/accessibility only. Provider-owned/shared evidence was
not deleted.

## Limits

This is a bounded smoke pass, not completion of every V1 acceptance journey.
Collector coverage stops at the landing/challenge state; no challenge was bypassed
and no new respondent session/answer was created. Export contents and signed
integration delivery were verified separately by the parent, not in this browser
pass. Response detail rendering, editor mutations, complete submission recovery,
authenticated mobile visual reflow, assistive-technology behavior and real-device
behavior are not established here.

Screenshots establish visual observations at the recorded viewport only. No
complete WCAG audit or browser geometry measurement was run. Navigation/tool
elapsed time is not p95 usable time, INP, CLS or durable-submit latency; this pass
makes no production SLO claim. No product defect was demonstrated in the covered
completed flows.

## Evidence index

| Key | REA evidence ID                                                       |
| --- | --------------------------------------------------------------------- |
| E1  | `ev_ba3a2e34ffffc08c1380f79dbf60ef621c5738a0b8a50046a373005908e8efbd` |
| E2  | `ev_01f801a8686e97d724b63162ac6eb490f873653b2b29ba43980ce3668a919b81` |
| E3  | `ev_bc6f7171105e2baa059163b1a9f141878318043c8a23e9e66a8869a854ca20ba` |
| E4  | `ev_762a84117a3d018ad8f25c86b82c23528fc20e00ebf5d95c3c4873584026f122` |
| E5  | `ev_a32e9b08abc7ace075b26d1febb20b5b6d3d50bed30ad9c33748de315fe27cb9` |
| E6  | `ev_c322450948c2c36765d0e549755ca1dd83e8aff5a81c7426de95fea364c0f5fd` |
| E7  | `ev_6d11e89ec41fed6fe30b48e389c401946496562eb831a8f76618a14de22e6bcf` |
| E8  | `ev_7e3a0fbac73da51645742130f671f55fd49151082d469be0134bd4c1f939476b` |
| E9  | `ev_398d6070f3a2f0b28299734247254d2453989875c103445ede8ff76234b2da10` |
| E10 | `ev_1930e3e7616f66114e7734dfc3e94ecf4006818b977f4a298ebc6876deaea60f` |
| E11 | `ev_2a4b5ba6f4152c538bf0fb904ac9f61d8d15a58bc4ce58a0481b84b87a507f56` |
| E12 | `ev_d788046f1cfa122e3420a9ccc8712c329afbc917b23b76cc87acc2042ae51170` |
| E13 | `ev_cd1f55aee0a7cf864e808d9c2b77f5df34aab11ae437deccc2f1c8507dce6dca` |
| E14 | `ev_d9f5ea607f4d229c1ed8f9385e1a1614888400d34b8652c741af5f1cdd54376f` |
