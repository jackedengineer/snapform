# Snapform creation experience

## Outcome

A first-time author can start with a useful form, edit questions directly, inspect the respondent experience, and publish without learning the settings model first. Returning authors retain pages, conditional rules, completion messages, delivery controls, recovery and exports. No backend permissions or validation are weakened.

## Visual direction

Design Taste v2 app direction: framed sheet, seed 847565337. Keep the existing cobalt/lime brand and DM Sans. Blue-grey navigation surrounds a white work surface; ink titles, quiet dividers, one active underline. App screens prioritize writing and scanning. Marketing and auth can use larger, expressive typography. Native CSS feedback, no animation or component dependency. Reduced-motion preferences apply. Adapt the suggested graph-builder composition to a question editor; a flow graph and a read-only mobile builder would conflict with this product's core job.

## Ordered slices

1. Focused studio: Build / Settings / Publish & share, one-action question types on desktop, bounded mobile picker, insert after selection, preserve autosave and keyboard focus.
2. Faster start: useful agency/coaching/consulting/startup starters alongside blank forms; reuse the creation response so the editor does not immediately load the same form again. Keep retries idempotent.
3. Preview and handoff: safe draft preview using the same field renderer and rule evaluation; explicit preview state, no collection session or submission. Clear publication status and direct response access.
4. Cohesive surfaces: workspace discovery, response inbox and delivery settings, auth/public pages and collector. Keep settings secondary, data primary, and loading feedback local to the operation.
5. Final review: responsive, keyboard, normal/power/adversarial journeys; automated checks, production bundle budgets, staged review and deployment verification where authorized.

## Acceptance

- Adding a desktop question takes one click and focuses its label; mobile takes opening the picker and choosing a type.
- Creating from a starter needs no template gallery or naming dialog. Every starter is editable and uses fresh stable IDs.
- Hidden settings do not cause visible loading messages; a screen has one primary loading status.
- Draft preview never sends answers to the API or claims submission.
- 390px, 768px and 1440px layouts have no document overflow, clipped actions or focus loss.
- Production targets and all budgets in CONSTRAINTS.md remain unchanged. No new runtime dependency.
