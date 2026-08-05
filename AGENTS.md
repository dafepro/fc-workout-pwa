# AGENTS.md

## Product goal

Build a simple, safe training PWA for youth soccer players, mostly age 11. The product should mix a serious training tracker with light team challenges and social motivation.

## Required reading

Before planning or editing, read:

- `README.md`
- `docs/PRODUCT_BRIEF.md`
- `docs/UX_AND_SAFETY_RULES.md`
- `docs/SCREEN_SPECS.md`
- `docs/DOMAIN_MODEL.md`
- `docs/OPEN_DECISIONS.md`
- all images in `docs/mockups/`

## Working rules

- Work in small, reviewable steps.
- First produce an implementation plan and proposed file tree.
- Build the smallest useful interactive prototype before backend work.
- Keep the UI mobile-first and responsive down to 320 CSS pixels.
- Use semantic HTML and accessible native controls.
- Avoid open text fields, file uploads, image uploads, and external links in player-facing features.
- Use only predefined activities, reactions, avatar parts, and system messages.
- Never expose raw performance or assessment data in team or leaderboard views.
- Rank and reward effort, participation, consistency, streaks, and challenge completion only.
- Do not add chat, comments, announcements, or direct messaging.
- Do not invent product requirements silently. Record assumptions in `docs/OPEN_DECISIONS.md`.
- Add tests for business rules, especially visibility and entry deletion limits.
- Run formatting, linting, type checks, tests, and the production build before declaring work complete.

## Prototype conventions

- Use TypeScript.
- Keep mock data and domain logic separate from view components.
- Model activity input types rather than hard-coding one generic form.
- Prefer reusable components for progress bars, avatars, reactions, streak badges, and intensity scales.
- Use local mock persistence only for milestone 1.
- Put all user-facing copy in a central constants or content module so wording can be revised.

## Completion report

For each task, report:

1. What changed.
2. Important assumptions.
3. Commands run and results.
4. Screens or flows that should be reviewed next.
