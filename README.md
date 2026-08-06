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
- Milestone 1 used local-only identity; the connected deployment now uses reissuable QR+PIN credentials and revocable server sessions.
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

## Milestone 2 backend prework

The backend foundation lives in `backend/` and the review contracts live in `docs/backend/`. It currently includes:

- a dependency-light, cloud-hostable Go service with health/readiness endpoints and graceful shutdown;
- configuration validation and safe HTTP defaults;
- pure authorization rules for player, assigned-coach, and club-admin access;
- predefined contextual-reaction rules and a five-per-recipient team-day limit;
- a CGo-free SQLite adapter, embedded versioned migrations, and a repository boundary suitable for a later Postgres move;
- a first contextual-reaction API slice with idempotent writes, private inbox badges, and an authoritative daily limit;
- private training-entry create/list/detail/delete endpoints with server-owned timestamps, structured activity validation, and the 24-hour player deletion rule;
- a frontend gateway that uses the real API when configured and retains the milestone 1 device-local adapter as an unhosted fallback;
- a Docker Compose black-box E2E harness with a real SQLite database and no cloud dependencies;
- a migration-aware SQLite backup CLI with checksummed archives, isolated forward-migrating restore, and a Docker restore drill;
- a provider-neutral single-VM deployment bundle with Caddy-managed HTTPS, hardened containers, persistent host storage, and operator backup scripts;
- draft API, authorization, and persistence contracts for review before frontend integration.

See `backend/README.md` for local commands, `deploy/vm/README.md` for the provider-neutral bundle, and `docs/backend/DIGITALOCEAN_UNDER_5_RUNBOOK.md` for the under-$5 manual deployment. The backend and QR+PIN session path are deployable; real youth-data use still requires approved guardian/recovery policy, secure credential distribution, encrypted off-host backups, and privacy operations.
