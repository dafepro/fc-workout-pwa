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

## Testing policy

- Follow red-green-refactor TDD: add or change a failing test before implementing behavior.
- Author or update Docker E2E coverage for user-visible workflows when appropriate, but do not run the full Docker suite for every task. Normal completion uses tests targeted to the changed behavior plus formatting, linting, type checks, static analysis, and builds.
- Run the full Docker E2E and VM smoke suites only for intentional periodic passes, release-candidate validation, or when the user explicitly requests them. When a lighter-weight agent is available, delegate that execution and initial failure triage to it.
- Prefer black-box end-to-end tests for user-visible behavior. Run the application and its real dependencies in Docker, exercise it over its public HTTP interface, and apply the real database migrations.
- Keep the default end-to-end environment entirely local. It must not connect to cloud services or require cloud credentials.
- Avoid mocks. Prefer real containerized dependencies. When a dependency must be replaced, use a small in-memory fake that implements the same interface, and contract-test that interface against the real containerized adapter.
- Add unit tests only for critical, isolated logic whose combinations of states would be prohibitively expensive to cover through Docker end-to-end tests, such as authorization matrices, calendar boundaries, and rate limits.
- Gate any test that absolutely must contact an external service behind an explicit environment variable or build flag. Such tests must be skipped by default and documented.
- No default test command may require internet access, secrets, or a developer's personal account.
- Report exactly which targeted tests ran. Do not treat an intentionally skipped full E2E pass as a blocker for ordinary work.

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
