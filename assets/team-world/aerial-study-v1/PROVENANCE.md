# Aerial strike reference and animation

Authored September 22, 2026 for the pinned Avatar Studio 0.1.2 rig. No external
animation clip or motion-capture data was downloaded.

`reference.png` was generated with the built-in OpenAI image-generation tool.
The exact request is in `reference.prompt.txt`. The tool received the actual rig
renders `../kick-study-v3/model-front.png`, `model-side.png` and
`model-three-quarter.png` directly as image references. It produced side and
three-quarter studies of the header and bicycle phases. The sheet is an art
reference, not motion capture or an exact multi-view reconstruction. It is not
included in runtime asset preparation.

## References and process

- [FIFA: Heading](https://www.fifatrainingcentre.com/en/practice/beach-soccer/block-1/heading.php)
  informed the timing and body-position study.
- [FIFA: Scissor and bicycle kicks](https://www.fifatrainingcentre.com/en/practice/beach-soccer/block-1/scissor-and-bicycle-kicks.php)
  informed the overhead setup and scissor action.
- [Animation Mentor: reference, blocking, spline and polish](https://www.animationmentor.com/blog/animation-tutorial-with-lead-reel-fx-animator/)
  supplied the workflow; [its polish guide](https://www.animationmentor.com/blog/tutorial-how-to-polish-your-animation/)
  informed the broad-to-specific review.

The coaching material concerns beach soccer; the app animation is a stylized
game interpretation, not a claim to reproduce a recorded professional kick.
The existing physics timing and jump heights constrain the anticipation.

1. Block the load/coil, rise/scissor, contact, follow-through, landing and recovery
   on the actual thirteen-bone public rig. Keep contact at 0.20 seconds.
2. Compare front, side and rear silhouettes with the study. Give the header a
   backward load followed by a forward chest/forehead drive. Give the bicycle
   a horizontal torso, exchanged legs and a protected side/back landing.
3. Spline with bounded Hermite tangents. Fit a single contact-pose offset to
   the sphere surface; fitting each live swinging foot caused an unwanted vertical
   wobble and was removed. Ease the body turn through anticipation. The bicycle
   faces away from the shot so its boot follows through in the ball's direction.
   Unwrapped aim angles keep that turn continuous when the target crosses the
   facing axis; a Chrome regression reproduces the former one-frame reversal.
4. Polish the landing with actual rigid skin vertices against the map support,
   then blend back into locomotion. Preserve steering and reduced-motion behavior.
5. Validate actual-rig geometry, outgoing contact direction, floor clearance and
   recovery in hardware Chrome. Repeat with the real zmap simulation, three
   appearances, moving strikes and a raised floor. Review full-speed and slowed
   frame sequences from three angles. Physical-phone qualification is separate.

The maintained review tool is `tools/team-world/motion-review.html`; use
`?strike=header&simulation=1` or `?strike=bicycle&simulation=1`. The matching E2E
coverage is `e2e/campus-motion.spec.ts`. Local renders and measurements live in
ignored `outputs/campus/`; the authored source is `app/team-world/adapters/aerial-kick.ts`.
