# Alpha feedback 0.3

## My Sessions

- My sessions delete. You can make the whole row clickable. Delete will be in a separate session detail page rather than a `...` menu.

  **Codex · Addressed (2026-08-05):** The complete session row is now a link to a private session-detail route. The list menu is removed; deletion appears only on that detail page, still enforces ownership and the 24-hour limit, and requires confirmation.

- “How this session felt” — where did my exhaustion and exertion emojis go? Why is it just one?

  **Codex · Addressed (2026-08-05):** Restored two separate emoji values everywhere sessions are summarized: one for effort and one for post-session tiredness. The detail page displays both with their full questions and accessible seven-step values.

## Home workout instructions

- The `(i)` on the Hill Sprints moves from top right to top left of the expanded box when opened. It should remain in the same position when clicked so it can be shrunk down easily and should also disappear when it loses focus or the user swipes away.

  **Codex · Addressed (2026-08-05):** Replaced the native disclosure with a fixed top-right toggle layered over the expanded panel, so it never changes position. The panel closes from the same button, Escape, outside pointer/focus interaction, or a swipe gesture; these interactions have focused component tests.

## Leaders

- UI in Leaders: it’s weird that the toggles to show the leaders are separated by something that doesn’t change from the toggles. Instead, logically group them with some sort of border so it’s clear what they’re affecting.

  **Codex · Addressed (2026-08-05):** Moved the unchanged team summary above the leaderboard. Both toggle groups, podium, and ranking list now share one bordered panel, making their relationship explicit.

- In Leaders, all the header text is annoying. Just drop to the leaderboard main header. Same with Team. Just Team and the team name.

  **Codex · Addressed (2026-08-05):** Leaders now opens with only “Leaderboard.” Team now opens with “Team” and the team name; the eyebrow, icon, and descriptive header copy are removed.
