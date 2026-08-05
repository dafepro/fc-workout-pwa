# StrideCrew prototype handoff

This repository packet turns the product discussion and visual mockups into durable context for Codex.

## Recommended first milestone

Build a responsive, mobile-first PWA prototype with mock data. Implement the four player-facing screens and their main interactions before adding real authentication, persistence, coach tools, or production infrastructure.

## Start here

1. Read `AGENTS.md`.
2. Read all files in `docs/`.
3. Inspect the four mockups in `docs/mockups/`.
4. Use `CODEX_KICKOFF_PROMPT.md` as the first Codex task.

## Suggested prototype boundaries

- Player-facing experience only.
- Mobile first, but functional and clean on desktop.
- Use mock players, teams, assignments, logs, reactions, and assessment history.
- No free-form text, user images, URLs, or uploads anywhere.
- No production authentication in the first milestone.
- Represent the QR-code-plus-PIN login as a mocked flow only.
- Do not implement coach screens yet, but keep domain types ready for coach-created assignments and recorded assessments.

## Definition of done for milestone 1

- Four responsive routes match the intent and hierarchy of the mockups.
- Navigation works between Home, Log, Team, Leaders, and Me placeholders.
- Logging a session updates local in-memory or browser-local mock state.
- Activity-specific inputs change based on activity type.
- Effort and exhaustion use a seven-step kid-friendly control.
- Team progress and leaderboards use effort and consistency only.
- Raw performance and assessment results remain personal-only.
- Automated checks cover the main logging and visibility rules.
