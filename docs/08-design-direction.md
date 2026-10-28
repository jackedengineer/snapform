# Foundation 0.2 — design direction and review

**28 October 2026 · Proposed direction · Full review of the local specimen.**

## Recommendation and business fit

Choose **Expressive clarity**: DM Sans Variable, warm ivory, ink and cobalt; generous public typography, a dark product showcase with restrained lime/peach accents, and calm white operational panels. The public experience should feel considered enough to represent an agency or consultant to a prospective client. Reviewing an answer or repairing a delivery should remain easy to scan. Startup teams use the same practical controls and can choose their own brand theme later.

This extends the existing product position: better briefs and trusted handoff. It does not add an animation platform, change the V1 feature list, establish a conversion improvement, or justify a higher price without customer evidence. Test the introduction with the first pilot cohort for comprehension, professional fit and next-action discovery. Compare completion and error rates for the form/review journey before asserting a business benefit.

## References actually inspected

| Reference | Observed publicly on 28 October | Adopted principle / boundary |
|---|---|---|
| [Formless](https://formless.ai/) | Satoshi headings; computed hero 56px/56px at the inspected 746px viewport, tight negative tracking; black/white contrast; blue action; typewriter cursor | Confident geometric type, scale and contrast. Snapform uses original copy, layout, mark and openly licensed DM Sans. Our animation durations are proposals, not measured Formless timings. |
| [Mobbin](https://mobbin.com/) → Web → [Front inbox screen](https://mobbin.com/explore/screens/3e29dd35-0c1d-4f71-831b-af35c13bf1ec) | Bold public typography and sparse navigation; public Front example shows navigation, list and detail surfaces with selective accent | Restrained workspace hierarchy and progressive detail. No paid library/account-level access or claim that the entire Front system was audited. |
| [Vibrant](https://vibrant.design/) → [Cofounder hero example](https://vibrant.design/website/80g9vjk-cofounder-s-hero-section) | Large foreground message, landscape backdrop and floating status cards | Show a meaningful product story and status. Avoid importing pixel scenery or decorative cards unrelated to intake. |

Reference captures: [Formless](evidence/design-formless-hero.png), [Mobbin/Front](evidence/design-mobbin-front.png), [Vibrant](evidence/design-vibrant-cofounder.png). These are point-in-time observations; public galleries are inspiration, not user testing or proof that a capability is absent elsewhere.

## Scope and coverage

Framework: a local HTML/JavaScript design specimen using the existing plain CSS convention, with semantic CSS/JSON tokens. No application framework or animation library was introduced. At the time of this design review the previous stack was retained; the later same-day [platform revision](09-platform-stack-decision.md) supersedes those provider/framework choices with TanStack Start, Neon, R2 and Razorpay. This design review does not validate that new deployment. Review covers the experience, foundations, intake/review, trust/delivery and roadmap tabs. It does not cover an implemented builder, live publication, payment, backend persistence or model behavior.

| Category | Evidence inspected | Result |
|---|---|---|
| Typography | Font assets/license, CSS scale/tracking, desktop/mobile headings, labels, metadata and changing numeric values | Revised family/scale; captions corrected; narrower metadata simplified |
| Surfaces | Semantic palette, form/control boundaries, display panels, all five tabs at 320–1440px | Revised palette/radii; contrast calculated; roadmap overflow fixed |
| Animations | Introduction/replay, sample stages, 10% review speed, rapid replacement and motion-off switch | 4.2s slowed stage observed; manual off computed `animation-name: none`; no queued exit |
| Icons | Original mark and inline arrow/check SVGs; sizes, strokes and inherited state colors | Decorative SVGs hidden from accessibility tree; consistent 1.5px action strokes |
| Performance | CSS transition declarations, font sizes/subsets, script syntax and browser console | Named properties; 55,160 bytes total font files; no animation dependency or persistent `will-change`; no runtime performance profile performed |

## Changes and findings

Creative direction changes are marked Low; Medium identifies a concrete usability issue encountered during revision. Foundation 0.1 is archived for comparison.

| Severity | Location | Before | After | Why |
|---|---|---|---|---|
| Low | `design/tokens.css:2`, `design/tokens.json`, `design/fonts/` | System font only; optional brand font deferred | Self-hosted DM Sans Variable with fallback, subsets and OFL license/provenance | A consistent typographic voice supports the requested positioning with a bounded asset cost |
| Low | `design/tokens.css:13`, `design/system.css:114` | Green/gray utility palette and small page hierarchy | Ivory/ink/cobalt semantics, limited lime/peach, large display text and quieter UI scale | Separate first-impression hierarchy from operational density without losing one visual identity |
| Low | `design/system.html:23`, `design/system.css:124` | No product-story specimen | Original introduction and manual Collect/Review/Deliver example; four audience labels | Explain the product's business outcome before the component inventory |
| Low | `design/system.css:44`, `design/tokens.css:22` | 6px controls / 10px panels; compact target permitted 32px | 10px controls / 20px panels / 32px display; 44px touch and 40px compact desktop | Softer geometry and usable targets; structural borders remain visible |
| Low | `design/system.css:18`, `design/system.css:50` | Generic text identity; limited icon guidance | Original abstract mark, current-color arrows/checks and consistent decorative semantics | Give the specimen an identity without copying a reference mark or mixing icon styles |
| Low | `design/system.css:170`, `design/system.html:112` | Generic short-transition guidance | Once-only 600ms/80ms entrance; explicit 420ms/12px sample transition; 120ms hover; immediate work controls | Motion explains hierarchy and a deliberately requested stage change |
| Medium | `design/system.css:142` | First revision changed panel height between stages | Minimum sample-content space; all three desktop stage heights measured 522px | Keep controls and surrounding content stable while reviewing the workflow |
| Medium | `design/system.css:121` | First revision's hero paragraph rule also enlarged the caption | Explicit 12/18 caption; mobile date hidden; content remains in dated specification | Keep visual hierarchy and avoid a stranded date on narrow screens |
| Medium | `design/system.css:98` | First revision roadmap overflowed to 360px at 320px | Shrinkable grid track and text container with emergency wrapping | Preserve reflow without horizontal page scrolling |
| Low | `design/system.css:9`, `design/system.html:38`, `design/system.html:112` | New experience initially skipped heading levels | Ordered H1/H2/H3, visible focus, pressed stage states and polite state announcement; next-step focus restored to visible control | State and navigation need to remain understandable without the animation |
| Low | `design/system.css:239`, `design/system.html:84` | No inspectable motion control in the specimen | Manual off, 10% review-speed aid and reduced-motion CSS precedence; no smooth-scroll movement | Let reviewers inspect motion and ensure the same static content/actions remain usable |
| Low | `design/system.css`, `docs/04-design-system.md` | Styling embedded in HTML; older design contract | Separate specimen stylesheet, semantic tokens, revised implementation contract and archived 0.1 | Keep the revised direction reviewable without introducing a second product styling framework |

## Considered but rejected

| Location | Candidate | Rejected because |
|---|---|---|
| Typography | Use Formless's exact Satoshi setup | DM Sans gives a suitable geometric voice with bundled OFL provenance and one family; exact brand matching is unnecessary |
| Entire application | Extend the dark showcase across builder/results screens | Light operational panels better preserve the existing information hierarchy; full dark mode needs its own state/contrast testing |
| Hero | Infinite typewriter/cursor, parallax and scroll choreography | They repeat attention cost and can delay comprehension; the actual headline should be available immediately |
| Hero/background | Pixel landscape, 3D decoration or unrelated floating metrics | They do not explain the intake/review/handoff job and would add asset and maintenance cost |
| Motion implementation | Add Motion/GSAP now | Native CSS handles these two interactions; another runtime is not justified by this specimen |

## Verification and verdict

- All five tabs checked at **320, 375, 768, 1024 and 1440px**. The one 320px roadmap overflow was fixed and rechecked: document and viewport both 320px. Horizontal scrolling inside the tab bar is intentional; the document does not overflow.
- Visual review at desktop 1280px and mobile 375px. Keyboard ArrowRight changed the active tab and focus; keyboard Enter opened direct editing.
- Corrected synthetic budget from USD 7,500 to USD 8,200; confirmation displayed the corrected value and explicit local-only result. Creator factual approval and simulated retry displayed their respective states; retry became disabled after success.
- Slowed a sample transition to **4.2s** using the specimen's review-speed control and inspected an intermediate frame. Switched stages and disabled motion; the final content remained visible with computed animation `none`. This substitutes for a browser Animations-panel speed setting; it is not a frame-rate measurement.
- Normal-speed sample sheet geometry is stable across all three stages at 1280px. Source inspection confirms no timer, auto-advance, infinite animation, transition-all or broad `will-change`.
- Parsed token JSON, checked unique HTML IDs and JavaScript syntax. Calculated key palette combinations: primary/ivory **16.12:1**, secondary/ivory **6.59:1**, muted/ivory **5.01:1**, white/cobalt **5.67:1**, input outline/white **3.60:1**; [contrast results](../design/contrast-checks.json). Thin structural dividers are not input boundaries.
- Browser console returned no errors or warnings in the exercised revision flow. Local font files and license are included; no external font or animation service is required.

**Verdict:** suitable as the revised design direction and implementation reference. Manual screen-reader operation, OS-level reduced-motion emulation, browser zoom/landscape/real-device coverage, complete hover/active state review, automated accessibility audit, fallback font layout-shift measurements and user validation remain open. The static pending control is illustrative; loading/empty/network states require real product components. This is not an accessibility certification or a market-ready application.

Preview: [interactive specimen](../design/system.html), [desktop capture](../design/foundation-0.2-desktop.png), [mobile intake capture](../design/foundation-0.2-mobile.png). The original foundation is under `design/archive/foundation-0.1/`.
