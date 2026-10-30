# Retention policy browser journey — 30 October 2026

## Scope

Tested the local application at `http://127.0.0.1:5173` using the existing owned
synthetic QA workspace and shared Neon database. The policy started at **90 days**
and was restored to **90 days**, then independently re-read before sign-out.
Only the retention policy changed; no content deletion, purge job, email,
webhook delivery or other saved setting was triggered by this pass.

REA 6.5.0 controlled a fresh owned Chrome app window through its documented
connect mode, with a configured 375×812 viewport and Chromium
`156.0.8078.76`. The proven child-only environment secret-reference mechanism
supplied QA credentials. Request/response bodies, header values, storage and
answer capture stayed off. Only sanitized step/status metadata and a final safe
policy screenshot were retained. No login screenshot was requested.

The final complete run started after the parent's HMR update for the delayed-GET
cache fix. This browser pass does not simulate that race; the actual QueryClient
regression test is separate evidence.

## Expected and observed

| Mode / action                     | Expected                                                                                     | Observed                                                                                                                                                     |
| --------------------------------- | -------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Normal read                       | Owner opens policy and sees the saved value                                                  | Keyboard sign-in succeeded. Enter opened Response retention; policy GET returned 200 and the saved-policy text showed 90 days.                               |
| Select 365                        | Native select updates the unsaved choice                                                     | REA's native `select_option` chose 365. An attached/checked-option assertion passed.                                                                         |
| Missing acknowledgement           | Browser prevents submission and identifies the required control                              | Clicking Save with the checkbox unchecked focused the invalid checkbox. No policy PUT was observed before acknowledgement.                                   |
| Save 365                          | Acknowledged change persists                                                                 | After checking acknowledgement, Enter on Save produced PUT 200 and saved-policy text showed 365 days.                                                        |
| Repeated Save / focus             | A rapid repeat does not create another committed update; completion moves focus meaningfully | A second Enter was sent to Save. Exactly one completed PUT was observed for the 365 change, and the refresh button gained focus after save.                  |
| Reload                            | Saved 365 survives navigation/reopening                                                      | A document navigation reloaded the workspace. Reopening policy issued GET 200 and showed saved 365 days.                                                     |
| Restore 90                        | Original value is restored with explicit acknowledgement                                     | Selecting 90, checking the fresh acknowledgement and pressing Save produced PUT 200 and saved 90 text.                                                       |
| Refresh / independent read        | Saved 90 remains authoritative                                                               | Keyboard Refresh completed with GET 200 and saved 90 text. A separate scenario reopened the workspace, fetched policy again with 200 and confirmed 90.       |
| Back navigation                   | App back link returns to the workspace list                                                  | Enter on “All workspaces” reached the workspace list. This tests the app link, not the browser History Back command.                                         |
| Adversarial unavailable workspace | Another unavailable workspace ID exposes no policy                                           | Ordinary navigation to a synthetic unknown workspace returned forms 404 and a visible alert; retention controls were not reached.                            |
| Sign-out                          | Session ends before browser/profile cleanup                                                  | Sign-out returned 200 and the login form became visible. The harness then terminated its owned Chrome and removed its temporary profile and scenario inputs. |

The complete edit scenario observed **two policy PUT 200 responses total**:
one for 365 and one restoring 90. Policy reads before editing, after reload,
after refresh and in the independent final scenario returned 200. No JavaScript
page-error event occurred. The deliberate unknown-workspace 404 produced the
expected browser resource console error; successful policy scenarios had no
console errors.

## Native-select setup limitations

Two preliminary runs stopped before any policy PUT. The first incorrectly
waited for visibility of an option inside a closed native select. After changing
that assertion to attached/checked, the Mac/REA `End` key still did not establish
a 365 selection. The completed run used the documented native select action;
keyboard summary, Save, repeated Save, Refresh, back link and sign-out were
actually exercised. Neither preliminary attempt is presented as a product defect
or a successful policy mutation. Each re-read the unchanged 90 policy and signed
out.

## Screenshot and evidence handling

[72 — saved 90-day policy, mobile](../evidence/72-isolated-chrome-retention-375.png)
was visually inspected. The heading, explanation, warning and native select fit
the visible width. The focused acknowledgement is near the bottom of this
scrolled viewport; the longer policy content requires ordinary vertical scrolling.
This screenshot does not establish that every control is simultaneously visible,
a numerical overflow bound, real-device behavior or complete WCAG compliance.

The copied harness initially used the previous inbox image filename. The policy
image was moved to 72, and the earlier safe inbox image was recreated separately
at its original path. No credential, answer or login image was produced by that
filename mistake. No product source was changed and no Git commands were used.

## Remaining boundaries

The installed REA scenario schema has declarative navigation, native input,
clicks, keys and waits; it does not offer a documented arbitrary request/eval
action. No cookie/token extraction was used to forge PUTs. Server-side unsupported
periods, false/missing acknowledgement, stale revisions, forged roles and unknown
keys therefore remain the parent's Worker-boundary tests, not claimed browser
checks here.

This is **policy CRUD verification only**. The UI text describes the planned
expiry/deletion behavior on local development. Actual scheduled purge,
transactional deletion boundaries, encrypted-backup retention and recovery
filtering must pass their own tests before deployment or a production retention
claim. This pass neither ran a purge nor proved deletion/recovery. It makes no
production latency/SLO claim.

## Evidence identifiers

| Scenario                                                      | REA evidence ID                                                       |
| ------------------------------------------------------------- | --------------------------------------------------------------------- |
| Final run: initial 90 read                                    | `ev_0cc97e3755d158bb499731550aa5c749538861d03982fe907923812f18585545` |
| Complete edit, reload, restore, refresh and unknown workspace | `ev_92534b95fd394f4dbfa96d8f08be5b48d7c30687c1e086de60378b53e7f3900d` |
| Independent final 90 read / screenshot 72                     | `ev_eb5c6cde40bce114fe91fa00f2753660d678daec8ace82c8b5128c1bb0546981` |
| Final run sign-out                                            | `ev_a4f1c101b9e9c677c74f558b7ba84c03d96889a0c06c0bb2b02ef66d35aba847` |
| Preliminary option-visibility assertion (no PUT)              | `ev_be8a9ebbd7e98010a90bc52b5367cfb6a842f0fd482a721c05e7bcfc91311363` |
| Preliminary End-key selection attempt (no PUT)                | `ev_d8778338ac74e1f677cb3ca5e6016275c474e8494a1c53b75e12efa1a436b005` |
| Recreated safe inbox screenshot 71                            | `ev_ded45d6bcda6d8d7ee24170a74437647b10f734e4d5335cdedbf0bbb7edfe91a` |
| Inbox recreation sign-out                                     | `ev_8f551e0cf7d2a461b99990df819b28d54e03c5c65ee8df7da501f0246d7198ab` |
