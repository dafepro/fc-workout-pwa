QUICK TRAINING ENTRY FEEDBACK

- too much wording. Should simplify, think Apple design. Just call it "Record Training".
  - **Codex · Addressed (2026-08-05):** Renamed the screen to “Record Training” and removed the eyebrow, description, activity descriptions, and form footnote.
- Make the Exertion and exhaustion a single row split vertically and with spinners (mobile) and a more appropriate option for desktop.
  - **Codex · Addressed (2026-08-05):** Combined both values into one split card. Phones use emoji steppers; larger screens use compact seven-emoji choice strips. The stored 1–7 scalar model is unchanged.
- Move date and time to BELOW or integrated with the save session button so it's unobtrusive but still modifiable if needed (low frequency)
  - **Codex · Addressed (2026-08-05):** Date and time now appear as one compact collapsed row immediately below Save and expand only when the player chooses “Change.”
- When session is submitted, put the session saved toast as an overlay and move back to home/team/leaders or whereever the user was before. Or if too difficult, just go back to HOME
  - **Codex · Addressed (2026-08-05):** Successful submission returns to Home and shows a temporary overlay confirmation. Home was chosen for a predictable milestone-one flow.
- LOG shouldn't be a main button. It should be an always showing overlay big PLUS circle floating in the bottom right of the screen.
  - **Codex · Addressed (2026-08-05):** Removed Log from both navigation layouts and added a persistent floating plus action across routes.
- Simplify Save Session to just "Save" or even simpler if you can think of something like that.
  - **Codex · Addressed (2026-08-05):** Shortened the primary action to “Save.”

In general, remove wording from emojis where possible (numbers and text under exertion/exhaustion/emoji labels, etc). It should still be referenced as scalars in the backend for sure though

- **Codex · Addressed (2026-08-05):** Removed visible scale numbers and per-emoji descriptions. Accessible names still describe every choice, and automated tests confirm that effort and exhaustion remain independent seven-step scalar values.
