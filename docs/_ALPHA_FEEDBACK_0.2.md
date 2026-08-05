Home screen

- numbers on effort is unfriendly. use colors or images for the summary view here. Similarly, delete should at least be behind a tap or a click. Not right there on the front side.

  **Codex · Addressed (2026-08-05):** Replaced the numeric effort pill with a seven-dot color meter. Delete is now inside a three-dot action menu, requiring a separate reveal before the destructive action is available.

- Give each activity type its own stle rather than just a symbol on the side

  **Codex · Addressed (2026-08-05):** Each session type now has its own accent color, tinted icon tile, and card-edge treatment while retaining its recognizable symbol.

- remove "times distance, etc stay private" note

  **Codex · Addressed (2026-08-05):** Removed the note from My Sessions.

- "private history/Recent Sessions" should just be a single "My Sessions"

  **Codex · Addressed (2026-08-05):** Consolidated the two labels into the single heading “My Sessions.”

- "Log session" is hidden behind the big green blob. We'll probably replace that svg with a generated one later that is a single layer background image, so plan accordingly

  **Codex · Addressed (2026-08-05):** Kept the action in a protected foreground content layer and made the decorative hill a separate noninteractive visual layer. That visual can later be replaced by one background image without changing the card content or action placement.

- Add an (i) that you can tap for the details for how to do it, specific workout instructions. Not directly on the card "Fast feet, full recover, fast finish" should be a full clear instruction. Not sure kids know what full recovery means for example.

  **Codex · Addressed (2026-08-05):** Replaced the vague sentence with a tappable information control containing four concrete, age-appropriate steps, including what recovery means and basic footing/form guidance.

- "7 30-day sessions" I want instead a 6x5 grid that shows the past 30 days with green (like github contribution grid) cells, darker for more activities/higher-point

  **Codex · Addressed (2026-08-05):** Replaced the number tile with a compact 6×5, 30-day contribution grid sized like the other summary tiles. Empty days are neutral and activity days darken according to the day’s accumulated safe effort points; every cell has an accessible date/session label. Follow-up: removed the visible session count and reduced the box size so the image carries the summary.

- on hover/tap of the streak, say something silly (random from the backend) that calculates how long the streak would be if it was something else. "if your streak was hammerhead sharks, it would be 1.5 miles long! or something

  **Codex · Prototype addressed; backend pending (2026-08-05):** Hovering or tapping the current streak now reveals a randomized, calculated comparison from a predefined kid-safe pool. Milestone 1 keeps this pool local; serving the random prompt from the planned Go API is recorded for the backend milestone.

- instead of "view all", put a small arrow that indicates load more

  **Codex · Addressed (2026-08-05):** Replaced “View all” with a compact down-arrow control that loads three more sessions at a time.

- "Ready to move? Mason C Hill striders blah blah blah" Remove that. People can find it in the bottom right. And the bottom right "me" should have your own user avatar there or initial if no avatar chosen

  **Codex · Addressed (2026-08-05):** Removed the player greeting block. The Me navigation item now uses the current player’s colored initials avatar on mobile and desktop.

Record Training

- Choosing the workout type should take less space. So maybe on the right a vertical right edge that says change that lets you change it

  **Codex · Addressed (2026-08-05):** The form now opens with one compact selected-workout row and a vertical Change edge. The full activity chooser appears only when requested and collapses after selection.

- exertion and exhaustion should be simple questions instead of labels to the user

  **Codex · Addressed (2026-08-05):** Reworded the controls as “How hard did you work?” and “How tired are you now?” while preserving the underlying seven-step values.

- Training saved should fade away instead of disappear too quickly

  **Codex · Addressed (2026-08-05):** Extended the confirmation to 4.2 seconds and added a gentle fade-out, with reduced-motion behavior respected.

on Team, get rid of "Only predefined reactions are available. The short cooldown helps keep cheers thoughtful."

**Codex · Addressed (2026-08-05):** Removed the visible policy sentence; the predefined-reaction and cooldown safeguards remain enforced by the interface.
