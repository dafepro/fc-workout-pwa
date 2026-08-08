# ZoomiGo UX goals

Status: Draft for product-owner review  
Reviewed: 2026-08-08  
Baseline: `ca3e5d3`

This document is the UX north star and product-question queue for ZoomiGo. It
turns the product brief, safety rules, roadmap, mockups, alpha feedback, source
review, and a live pass at 320 and 1280 CSS pixels into principles that should
guide later implementation. It is intentionally written before more feature
work begins.

The mockups remain useful for hierarchy and emotional tone, but they should not
be treated as pixel targets. The current application is calmer and easier to
scan. The next step is to restore meaning, feedback, and delight without
restoring the mockups' density.

## North-star experience

A player opens ZoomiGo and understands the next useful action within three
seconds. A normal assigned session can be recorded in roughly 30 seconds, with
no knowledge of app terminology. Saving produces an immediate, honest moment of
accomplishment: the assignment changes state, personal progress changes, and the
player sees how showing up helped the team. The app then gives permission to
leave. It never pressures the child to add volume, protect a streak, disclose
more, or compare athletic ability.

The desired emotional sequence is:

1. **Clarity:** “I know what I can do.”
2. **Agency:** “I can choose within safe boundaries.”
3. **Competence:** “I completed it and can see the result.”
4. **Relatedness:** “My effort helped my team, and my team noticed.”
5. **Closure:** “I am done for now.”

Fun should come from agency, mastery, warm feedback, light surprise, and team
belonging. It should not come from anxiety, popularity counts, streak loss, or
pressure to report a more impressive result.

## Product UX philosophy

### One screen, one dominant job

Each route should answer one question:

- Home: What should I do next, and how am I doing?
- Record: What did I complete, and how did it feel?
- Team: How are we showing up together, and whom can I encourage?
- Leaders: Which safe habits are we celebrating?
- Me: What is mine, private, and customizable?

Secondary information should support that question or move behind a clear
disclosure. A floating Record action is valuable across browsing routes, but it
has no job on the Record route itself.

### Agency with guardrails

The coach's assignment can be the helpful default without becoming a command.
Approved alternatives should remain easy to find, understandable in place, and
equally valid. This supports autonomy while retaining the locked-down activity
model. The interface should make the common safe choice fast, not make every
other choice feel like disobedience.

### Competence before competition

Progress should first answer “What have I done?” and “What is my next reachable
step?” A ranking should never be the primary proof that a child is succeeding.
Completion states, personal trends, consistency, and team contribution should
carry more visual weight than rank or a large lifetime point total.

This applies Self-Determination Theory's autonomy, competence, and relatedness
frame to the product. Satisfying those needs supports higher-quality motivation;
frustrating them can produce pressure, exclusion, or helplessness. See
[Basic Psychological Needs](https://selfdeterminationtheory.org/topics/application-basic-psychological-needs/).

### Feelings are a mirror, not currency

Effort and exhaustion are useful when they help a child reflect and help trusted
adults notice a pattern. They become less honest when selecting a higher effort
also earns more public points. The preferred direction is to keep feelings
private and base public rewards on capped participation and consistency. This is
a product-owner decision, not an implementation assumption.

Recovery must also read as success. A recovery activity, a rest suggestion, or
the end of a planned workout should not look like a lesser choice.

### Team energy without a popularity contest

The Team route should feel like a shared scoreboard against a goal, not a feed
and not a tally of who is liked. Cheers should be contextual, predefined, easy
to understand, private to the recipient, and rate-limited. Public reaction
totals would turn support into status and should remain absent unless there is a
compelling safety case for them.

### A streak must never hold a child hostage

Streaks can make consistency legible, but loss aversion is the wrong motivational
engine for an 11-year-old training product. Rest days, recovery guidance, and
coach-planned breaks must not feel like failure. No countdown, alarm, or copy
should imply “train today or lose what you earned.”

### Delight should explain cause and effect

Motion and celebration should connect an action to its consequence: the Save
button completes, the assignment card changes state, the weekly progress moves,
and team energy responds. One coherent transition is more delightful than
several decorative animations. Reduced-motion behavior must communicate the same
state without depending on motion.

### Recognition, honest defaults, and immediate feedback

Children should be able to recognize choices without remembering instructions
from another screen. Activity details belong beside activity choices. Feeling
labels and values must be visible, not only available to assistive technology.
Defaults should be plausible in a child's units, and all values should be easy
to adjust by touch and keyboard.

These choices apply the usability principles of system-status visibility,
real-world language, error prevention, recognition over recall, and focused
minimalism. See
[Nielsen's usability heuristics](https://www.nngroup.com/articles/ten-usability-heuristics/).

### The safe path should be the easy path

High privacy, wellbeing, and adult-help paths should never be visually or
procedurally disadvantaged. For this age group, choices should encourage
conscious decisions and wellbeing rather than exploit affirmation or urgency.
See the ICO's
[age-appropriate guidance on nudge techniques](https://ico.org.uk/for-organisations/uk-gdpr-guidance-and-resources/childrens-information/childrens-code-guidance-and-resources/age-appropriate-design-a-code-of-practice-for-online-services/13-nudge-techniques/).

### Mobile means thumbs, motion, glare, and distraction

The 320-pixel layout is a real product surface, not a shrink test. Frequent and
sequential controls should target 44 by 44 CSS pixels where practical, exceeding
the WCAG 2.2 minimum. See the W3C guidance for
[enhanced target size](https://www.w3.org/WAI/WCAG22/Understanding/target-size-enhanced).
The core journey should also be covered at a mobile viewport rather than relying
only on the current Desktop Chrome end-to-end configuration.

## Current experience review

### What is already working

- The visual system feels energetic without looking designed for a very young
  child. Lime, navy, rounded cards, and simple code-native art create a distinct
  identity while final brand assets remain open.
- Home establishes a strong visual priority: assigned activity, weekly progress,
  personal summary, sessions, then team pulse.
- Record Training keeps date and time out of the primary path while using native
  date and time controls when needed.
- Team is a finite progress board with the approved positive groups. It does not
  expose raw performance.
- Teammate rows are the reaction targets, the current player cannot react to
  themself, and received cheers are private on Me.
- Leaders uses authoritative safe projections and clearly states that athletic
  results remain private.
- Semantic regions, native controls, focus styles, retry states, and reduced
  motion already provide a solid accessibility base.

### Friction and missing meaning

#### Home and the completion loop

- The API returns `currentAssignment.completed`, but Home ignores it. After a
  successful assigned workout, the toast appears while the hero can still say
  “Next workout” and continue asking for the same session. This breaks the most
  important cause-and-effect loop in the app.
- The save flow confirms persistence but does not yet create an earned moment of
  closure or explain the contribution to team progress.
- Current identity is reduced to initials in navigation. On a remembered or
  shared family device, the player should be able to confirm the active name and
  team without navigating away.
- Much player-facing copy remains inline even though copy is intended to be
  centrally revisable. This will slow tone and comprehension testing.

#### Record Training

- The deployed alpha cannot save any entry and returns “That team is
  unavailable.” Until that is fixed and reproduced with the real provisioning
  path, every other improvement is secondary.
- The selected activity uses a narrow Change button. Tapping the activity card
  itself should open the choices; the card already looks interactive.
- Activity choices do not expose workout instructions. The existing
  `WorkoutInstructions` component is hard-coded to Hill Sprints and appears on
  Home only.
- Distance Run starts at `0.1 miles`, uses tenths, and lacks the plus/minus
  adjustment afforded to repetitions. Duration inputs have the same interaction
  inconsistency.
- At mobile width, effort and exhaustion show only a face plus minus/plus
  controls. The selected label and number are visually hidden, making an
  already ambiguous face carry too much meaning. Level 4 uses an open-mouth face
  that reads as surprise.
- The four feeling adjustment buttons measure 38 by 38 CSS pixels in the live
  320-pixel layout. They are frequent sequential controls and should be larger.
- The floating Record `+` remains active on the Record route and can overlap form
  content. It is redundant while already recording.
- The server error “That team is unavailable” describes neither the membership
  date problem nor a useful recovery action.

#### Team and cheers

- The route leads with the weekly session goal, while the current assignment is
  visible only on Home and Record. The player cannot see the team's shared
  challenge and challenge completion together.
- The reaction picker shows emoji without visible labels. “Wind,” “Robot leg,”
  and “Do it” are not self-evident to every child even though their accessible
  names are good.
- The current player is not explicitly marked as “You,” and the compact avatar
  strip clips context at 320 pixels. Finding oneself should be immediate.
- The board is finite, but twelve full progress rows still make encouragement
  targets expensive to scan. Group summaries and progressive disclosure could
  preserve the board model without becoming a feed.

#### Leaders

- A full 1-to-12 ranking and special podium dominate the page before the safety
  explanation. The player in twelfth place experiences the product before they
  reach “Every player's effort counts.”
- “Safe participation points” and a large Team Effort total are internally safe
  but not meaningful to a child without a visible goal or explanation.
- Because self-reported effort affects points, the board can reward selecting a
  harder feeling rather than reporting accurately.
- The current player's row is non-reactable, but it is not highlighted as “You”
  or kept in context when it falls below the first viewport.

#### Me, PWA trust, and test coverage

- The avatar builder changes only a local kit color and does not persist. Its
  “locked options” copy describes a restriction rather than inviting play.
- Assessment and security placeholders occupy prominent space without yet
  offering a player action. Me risks becoming a roadmap page instead of a useful
  private home.
- Home and Me currently present nearly the same session list. Home should show a
  compact recent proof of progress; Me should own complete history and private
  management.
- The service worker provides a cached shell, but connected offline behavior has
  no explicit status, recovery promise, or end-to-end coverage. A shell that
  opens and then fills with errors does not feel offline-capable.
- Browser end-to-end coverage runs as Desktop Chrome. There is no core
  320-pixel journey, touch-target, or visual-overlap gate.

## Prioritized, non-operator work

### P0 — Restore and prove the save path

Status: Implemented and targeted-Docker-verified 2026-08-08.

Reproduce the alpha failure using a disposable player created through the real
admin provisioning path, not only the E2E fixture seeder. Add the failing test
first, fix the membership/calendar inconsistency, and replace the misleading
error with a specific, actionable state. Verify today and allowed backdates in a
non-UTC team.

Definition of done:

- A provisioned player can sign in, save today's assigned activity, reopen it,
  and delete it through the public HTTP surface.
- The same player can save an allowed backdated activity when membership was
  active on that date.
- An actually inactive membership produces accurate player-facing copy and no
  partial write.
- Targeted store/API tests and the connected browser journey pass locally in
  Docker. The full periodic suite is not required for this slice.

### P1 — Make Record Training obvious, legible, and thumb-friendly

Status: Implemented and targeted-Docker-verified 2026-08-08. The live visual
pass covered the assigned and alternate paths at 320 CSS pixels, including the
instruction overlay, direct entry, steppers, feeling controls, and fixed-control
overlap. A same-day follow-up replaced the feeling choices with stacked sliders
and aligned session-history visuals with their continuous scales.

Address the concrete alpha and live-review friction as one coherent input pass:

- make the selected activity card the picker trigger and remove its Change
  button;
- expose shared, activity-specific instructions beside every picker option;
- add honest per-activity defaults and consistent direct-entry plus stepper
  controls, including quarter-mile Distance Run steps and a one-mile default;
- use always-stacked seven-step sliders with three emoji anchors, no visible
  numeric or descriptive value text, distinct effort and tiredness gradients,
  and touch targets at least 44 pixels high;
- show saved effort and tiredness as positions on compact read-only gradients
  so session history preserves all seven values without seven separate faces;
- hide the Record FAB on the Record route before attempting the larger
  button-to-screen morph transition.

Verify the assigned and alternate activity paths at 320 pixels, including
keyboard operation, minimum/maximum boundaries, labels, focus order, and no
fixed-control overlap. Keep activity definitions as the single source of truth.

### P1 — Complete the reward loop without rewarding more volume

Use the authoritative assignment completion flag after save. Change the Home
hero from “Next workout” to a completed state, animate progress once, explain
the team contribution, and end with a recovery-neutral closure such as “Nice
work—you're done for today.” Preserve the existing reduced-motion behavior.

The end-to-end assertion should be visible, not only an API check: saving the
assigned workout must change the Home hero and weekly progress. A second entry
must not earn another public daily score or produce escalating celebration.

### P2 — Put the shared challenge and understandable cheers on Team

Bring the current assignment/challenge into the authoritative Team projection,
show challenge completion without raw results, mark “You,” and add short visible
labels to the reaction choices. Keep the board finite and contextual.

Verify that a save updates Home and Team, that only eligible teammates can be
cheered, that the private recipient message identifies the context safely, and
that no raw result reaches the social response.

### P2 — Decide whether the leaderboard earns its emotional cost

Do not polish the podium until the owner answers the questions below. If the
full ranking remains, place the safety frame before it, keep the current player
in context, explain the metric in child language, and decouple self-reported
feelings from points. Consider a team-versus-goal view, personal progress, or
positive bands as safer alternatives to a complete rank order.

### P3 — Make Me playful and useful

Persist approved avatar configuration, rename the invitation to “Choose your
look,” and decide the smallest fun option set that does not depend on unapproved
mascot art. Give Home and Me distinct session-history roles. Replace placeholders
only when the assessment and credential workflows have real player actions.

### P3 — Add PWA confidence and a mobile quality gate

Add an explicit connected offline state, install/update/offline checks for the
supported mobile browsers, a 320-pixel Playwright project for core flows, and
keyboard/screen-reader/reduced-motion assertions proportionate to each change.
Treat source cleanup—central copy, reusable state components, and removing dead
CSS—as part of the feature slices that touch those areas.

## Pointed product questions

These questions should be answered or deliberately deferred before the related
feature is implemented:

1. What should the child in twelfth place feel and do next? If the answer is not
   “proud, included, and clear on a reachable step,” should ZoomiGo show a full
   rank order at all?
2. Should effort and exhaustion be private reflection data only? If effort still
   affects points, how will the product avoid teaching children to select the
   highest rewarding answer?
3. What counts as a healthy streak day: a hard workout, any approved activity, a
   recovery session, or a coach-planned rest day? Can a streak pause without
   framing rest as loss?
4. After the assigned workout is complete, should Home recommend recovery,
   simply celebrate and stop, or offer another approved activity? The preferred
   safety default is celebrate and stop.
5. Is the weekly goal the same for every child regardless of attendance,
   injury, other teams, and coach direction? If not, which structured adult
   control owns the exception?
6. Should the active player's first name and team be persistently visible on a
   remembered device to prevent sibling/shared-device confusion?
7. Does Team need one current whole-team challenge in addition to the weekly
   session goal, or should those concepts be merged in the child's mental model?
8. Should cheers remain one-tap sends, or should the selected reaction gain a
   visible label and brief preview before send? What is the acceptable tradeoff
   between speed and accidental sends?
9. Are reaction totals intentionally private forever? The recommended answer is
   yes, because public totals manufacture popularity rankings.
10. How much avatar choice is enough to create ownership before final art is
    approved: kit color only, a small code-native parts set, or no expansion
    until the visual system is final?
11. In connected mode, what promise can the PWA honestly make offline: read-only
    recent data, queued entries, or an explicit unavailable state? It should not
    imply that an unsent workout was saved.
12. Which product signal matters most after two weeks of use: sessions recorded,
    goal completion, return rate, honest feeling variation, team cheers, or
    player-reported enjoyment? Avoid optimizing engagement time; a fast visit
    that ends after a completed log is success.

## Review method for future slices

For each player-facing change:

1. State the child outcome and the safety failure it must avoid.
2. Add or change a failing black-box test before implementation.
3. Exercise the public HTTP path with real local dependencies when behavior
   crosses the API boundary.
4. Review at 320 pixels, a common phone width, desktop, keyboard, and reduced
   motion.
5. Confirm no social response contains raw performance or assessment data.
6. Ask whether the change pressures volume, streak protection, disclosure, or
   popularity.
7. Run the targeted tests plus formatting, linting, type checks, static checks,
   and the production build; reserve full Docker and VM suites for intentional
   periodic or release-candidate passes.

The most useful usability session is not “Do you like it?” Give a player the
phone and ask: “Show me what you would do after finishing today's workout.”
Observe where they pause, what they think the faces mean, whether they notice the
date, what they expect Save to change, and how they feel when they find their
name on Team and Leaders. Ask the parent or coach separately what information
they assumed was public.
