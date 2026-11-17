# ADR-025: Clear identity, with Bright motion on client forms

Status: accepted by the user on 17 November 2026, from the identity proposal
that compared Clear, Bright and Night on the same publish-to-brief journey.

Snapform's positioning is "Get the brief before the call": enquiries become
qualified briefs for agencies, consultants and coaches. The owner's screens
should stay quiet so each client's brand leads, and the form a client fills in
should feel quick.

## Decision

- **Owner screens use Clear.** Geist Variable for all text, ink `#13151A` on
  porcelain `#F6F7F9`, one cobalt `#2B4CFF` for actions, cool greys with a slight
  cobalt bias, 10px controls and 16px panels.
- **The mark is the edit caret.** The wordmark is lowercase "snapform" followed
  by a cobalt caret, because owners write their questions on the form itself. The
  italic "s" badge is retired.
- **Motion settles.** Owner interactions use a strong ease-out,
  `cubic-bezier(.23,1,.32,1)`, at 140–200ms. Pressable controls scale to 0.97
  on press. Only transform and opacity animate. Keyboard actions do not animate.
- **Client forms borrow Bright's motion.** Question changes on the public form
  use a soft overshoot, `cubic-bezier(.34,1.36,.64,1)`, at 300ms, so answering
  lands with a little give. The owner's colours, not Snapform's, lead there.
- **Night becomes Clear's dark mode** when dark mode is built, not a separate
  identity.
- Reduced motion sets every duration token to zero.

## Consequences

Geist replaces DM Sans and is 11,512 bytes smaller across both subsets; its
provenance and license are in [design/fonts/README.md](../../design/fonts/README.md).
Lime and peach accents are replaced by one cobalt highlight, `#E8ECFF`. Every
text pair in [design/contrast-checks.json](../../design/contrast-checks.json)
still meets WCAG AA, and controls meet the 3:1 non-text minimum. No dependency
is added: the motion is plain CSS transitions on the existing tokens.
