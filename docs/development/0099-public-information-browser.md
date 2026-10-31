# Public information pages browser QA — 30 October 2026

## Scope

Tested the local application at `http://127.0.0.1:5173` using REA-controlled
isolated Chrome launch profiles. Chromium reported `156.0.8078.76`; completed
scenarios reported `cleanup: terminated-owned-process`. No login, dashboard,
email client, form start, answer entry, response submission or challenge bypass
was performed. Network bodies, header values and storage capture remained off.
Collector coverage captured landing accessibility and popup/URL/status metadata,
not collector DOM, tokens or answers. Public information copy was safe to capture.

## Normal, keyboard and adversarial journeys

| Mode / viewport          | Expected                                                                   | Observed                                                                                                                                                                                                                                                                                               |
| ------------------------ | -------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Normal, 320×740          | Support content is readable and publishes the approved contact             | Title/body wrapped within the visible width. AX exposed the public `mailto:trainwithchirag@gmail.com` link; the 320px footer/contact capture shows it without clipping. No email was opened or sent.                                                                                                   |
| Normal, 375×812          | Privacy page reads clearly on mobile                                       | Title, introduction and sections wrapped within the viewport. Its named contact/footer links were present.                                                                                                                                                                                             |
| Normal, 1440×1000        | Abuse page has a restrained readable layout on desktop                     | Content stayed in a readable central column. Sections, contact and footer were visible after skipping to main.                                                                                                                                                                                         |
| Normal/power, 375×812    | Home and authentication footers reach the information pages                | Clicked home-footer Support, then used Enter on footer Privacy and Report abuse. Expected headings and URLs appeared. Header Sign in opened login; Enter on its Support footer returned to Support. No auth field was filled or submitted.                                                             |
| Keyboard, 320/375/1440   | Skip links reach the named main target                                     | Enter on Skip to content changed each information-page URL to `#main`; the scenario also found `main#main h1`. Screenshots show main content aligned at the top after the skip. Active-element focus was not separately measured.                                                                      |
| Keyboard, 320×740        | Footer links have a visible focus state without activating mail            | Tab from the contact link focused “Back to Snapform”; its blue outline and the contact/footer layout were visible. No popup or mail navigation occurred.                                                                                                                                               |
| Adversarial, 320×740     | Encoded HTML/event-handler and JavaScript-shaped query values remain inert | Support loaded with an encoded image/event-handler query and a JavaScript-shaped next value. The page kept its expected content; captured public DOM contained no injected image/script element or reflected attack text. No `/x` request, page error, POST or off-origin navigation was observed.     |
| Adversarial, 1440×1000   | Unknown nested route fails safely                                          | `/privacy/not-a-page` with an encoded script-shaped query returned HTTP 404, a friendly not-found heading and a return link. One main/H1 remained; query text was not rendered as executable markup. Its initially missing skip target was fixed and rechecked below.                                  |
| Collector/power, 375×812 | Help opens separately and preserves the form                               | Enter on Support, Privacy and Report abuse produced three popup-opened events and three corresponding document GET 200s. Link names announced “opens in a new tab”. The original page retained its collector URL and welcome heading; there were zero Snapform POSTs. No response session was started. |

Normal information/navigation scenarios had no JavaScript page errors or
first-party error responses. The unknown nested route's 404 resource message
was expected. Collector challenge activity was outside the footer assertions;
there were no collector first-party console errors or JavaScript page errors.
The local challenge remained uncompleted; this does not establish submission
behavior or production Turnstile configuration.

The contact address matches the user-provided public address. Mailbox delivery
and monitoring were not tested, and no `mailto:` link was activated.

## Bounded automated structural checks

JavaScript assertions over three actual public accessibility snapshots passed
**27/27** checks (nine per page):

1. Exactly one main landmark.
2. Exactly one level-one heading.
3. The expected named level-one heading.
4. The expected number of nonempty named level-two headings (Support 5,
   Privacy 7, Report abuse 4, including the contact heading).
5. The exact public mailto destination.
6. Exactly one named Support footer link.
7. Exactly one named Privacy footer link.
8. Exactly one named Report abuse footer link.
9. The post-keyboard-skip URL ends in `#main`.

The scenarios independently waited for `main#main h1`. These are structural and
navigation assertions, not axe-core, contrast, screen-reader, full keyboard-order,
real-device or WCAG certification. No package was installed. Screenshot review
establishes observations at the recorded viewport, not numerical overflow bounds,
field performance, legal compliance or accuracy of every operational copy claim.

## Resolved finding: unknown-page skip target

The initial unknown-route DOM contained the global `href="#main"` skip link
but its `<main class="not-found">` lacked `id="main"`. The parent added the
matching ID to the root not-found/error components. A fresh 320×740 browser
recheck found `main#main.not-found h1`, confirmed the DOM target and activated
the skip link with Enter; the URL became `/privacy/not-a-page#main` with no
JavaScript page error. This resolves the observed 404 issue. An actual exception
was not induced to exercise the error component; its source change and native
HTTP tests are separate parent evidence. Product code was not changed by this
QA agent.

The parent also corrected the privacy recovery wording. A fresh public AX
snapshot confirmed all four statements: recovery is available for up to seven
days; expired recovery data is cleaned when collection is next opened; browser
site-data controls can remove it; Forget this browser does not delete an already
saved server response. The updated snapshot retained one main/H1 and its skip
link worked. Screenshot 74 remains valid because that changed paragraph is below
the visible portion of the original capture.

## Screenshots inspected

- [73 — Support after skip, 320×740](../evidence/73-isolated-chrome-support-320.png)
- [74 — Privacy after skip, 375×812](../evidence/74-isolated-chrome-privacy-375.png)
- [75 — Report abuse after skip, 1440×1000](../evidence/75-isolated-chrome-abuse-1440.png)
- [76 — Support header focus, 375×812](../evidence/76-isolated-chrome-support-focus-375.png)
- [77 — Collector help links, 375×812](../evidence/77-isolated-chrome-collector-help-375.png)
- [78 — Support contact/footer focus, 320×740](../evidence/78-isolated-chrome-support-footer-320.png)

The first three images intentionally begin at main content after the skip link;
the header is above the scrolled viewport. No screenshot contains credentials,
session capabilities or answers. No Git commands or product edits were made.

## Evidence identifiers

| Scenario                           | REA evidence ID                                                       |
| ---------------------------------- | --------------------------------------------------------------------- |
| Support 320                        | `ev_98724a1a574a6cfd1804fe8fde7f3a39b707f855c3c98f451f90bd3d212e4a98` |
| Privacy 375                        | `ev_274e946ee4b8a8f9af7099e810cd51bec73de55231d70376c370e556194bdfd2` |
| Report abuse 1440                  | `ev_3d8521de78855dbdf82358b76d717a557ac6649abbb8adfb08d07eb17a13cadb` |
| Home/footer/auth navigation 375    | `ev_8d9ae825c6767eb1c5835388874285552494f3b5f74436e7f1a4fce30920bb10` |
| Injection-shaped public query 320  | `ev_9507565fde307728cfc097a4676f6d49d6c644ef46fe27e33cd6339afdfa2b45` |
| Unknown nested page 1440           | `ev_db207d9ffe3ea4f21c65edda1cc30eebfc86e0d033af65dd1289e0c98e75bca6` |
| Collector popups/preservation 375  | `ev_ed71b5ac6a74998c86a04af94d7f6b2c13b0d9648857e04b36d0bc8b3d33e8f2` |
| Contact/footer keyboard focus 320  | `ev_5b7c498537e21d782e69c9b920b95351dc939c50c2228f3794679b230965afe9` |
| Fixed 404 skip target, 320         | `ev_586f7b693c6f82804f1aaf692dcd7c26ca54fa2cfa9cc10668a9d162b70339ab` |
| Updated privacy recovery copy, 375 | `ev_f8e772727873ce98cd1a117d91fa1a66cc76547bad86adc74e960906a7d135f0` |
