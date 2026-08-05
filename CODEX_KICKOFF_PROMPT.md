# First Codex task

Read `AGENTS.md`, all files under `docs/`, and inspect every image in `docs/mockups/` before making changes.

Build milestone 1 of the StrideCrew player-facing PWA as a responsive, interactive frontend prototype.

Start by doing the following:

1. Summarize the product rules that most affect implementation.
2. Propose a frontend stack and explain any added dependencies.
3. Propose a small route and component structure.
4. List assumptions that you will add to `docs/OPEN_DECISIONS.md`.
5. Then scaffold and implement the prototype.

Required routes:

- `/` player home
- `/log` quick training entry
- `/team` team activity
- `/leaders` leaderboards
- `/me` simple profile/avatar placeholder

Required behavior:

- Match the design intent of the mockups, but build a coherent responsive system rather than pixel-copying image-generation mistakes.
- Mobile first, with a usable desktop layout.
- Use mock data for one team and at least 11 players.
- The home screen shows the next assigned workout, weekly progress, personal history summary, and team preview.
- The log screen defaults to Hill Sprints but supports all four launch activities with activity-specific structured inputs.
- Allow dates from today through seven days ago.
- Include seven-step effort and exhaustion controls.
- Saving a session updates the local prototype state and related views.
- A player may delete their own entry for 24 hours; entries cannot be edited.
- The team screen shows challenge participation, positive weekly progress groups, and predefined reactions only.
- The leaderboards rank effort, streaks, and consistency only.
- Raw performance and assessment data must never appear in team or leaderboard views.
- Do not add free-form text, chat, comments, links, or uploads.
- Keep domain logic separate from UI components.
- Add automated tests for the activity-specific form, seven-day backdating rule, 24-hour deletion rule, and raw-performance visibility rule.

Before finishing, run formatter, linter, type checker, tests, and production build. Use browser inspection or Playwright to check all routes at a phone width and a desktop width. Report any mismatch or unresolved choice instead of silently inventing behavior.
