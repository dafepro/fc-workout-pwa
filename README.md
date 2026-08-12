# ZoomiGo

This repository packet turns the product discussion and visual mockups into durable context for Codex.

## Recommended first milestone

Build a responsive, mobile-first PWA prototype with mock data. Implement the four player-facing screens and their main interactions before adding real authentication, persistence, coach tools, or production infrastructure.

## Start here

1. Read `AGENTS.md`.
2. Read all files in `docs/`.
3. Inspect the four mockups in `docs/mockups/`.

Active priorities and release gates are maintained in `docs/ROADMAP.md`.

On macOS or Linux, `./scripts/verify.sh` runs every static, unit, build, and
contract gate. For an intentional periodic or release-candidate pass, use
`./scripts/verify.sh --all` to append the Docker API/browser E2E and VM
backup/restore smoke suites. `./scripts/drills.sh` rehearses the production
operations drills — bounded logs, encrypted backups, isolated restore, cutover
and rollback, QR reissue and revoke, the incident-release path — entirely in
containers. Unix shell is the only supported local automation environment.

Run `./scripts/install-git-hooks.sh` once per clone. It points `core.hooksPath`
at `scripts/git-hooks`, whose `pre-commit` hook rejects a commit whose staged
files would fail the `pnpm format` gate in CI.

## Suggested prototype boundaries

- Player-facing experience only.
- Mobile first, but functional and clean on desktop.
- Use mock players, teams, assignments, logs, reactions, and assessment history.
- No free-form text, user images, URLs, or uploads anywhere.
- Milestone 1 used local-only identity; the connected deployment now uses reissuable QR+PIN credentials and revocable server sessions.
- Use the connected QR-code-plus-PIN login flow for hosted environments; the
  device-local adapter remains available only for an unhosted prototype.
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
- predefined contextual-reaction rules and a five-per-recipient rolling 30-minute limit;
- a CGo-free SQLite adapter, embedded versioned migrations, and a repository boundary suitable for a later Postgres move;
- a first contextual-reaction API slice with idempotent writes, private inbox badges, and an authoritative rolling rate limit;
- safe, server-ranked Team and Leaderboard projections derived from active memberships and participation only;
- private training-entry create/list/detail/delete endpoints with server-owned timestamps, structured activity validation, and the 24-hour player deletion rule;
- a frontend gateway that uses the real API when configured and retains the milestone 1 device-local adapter as an unhosted fallback;
- a Docker Compose black-box E2E harness with a real SQLite database and no cloud dependencies;
- a migration-aware SQLite backup CLI with checksummed archives, isolated forward-migrating restore, and a Docker restore drill;
- a provider-neutral single-VM deployment bundle with Caddy-managed HTTPS, hardened containers, persistent host storage, and operator backup scripts;
- draft API, authorization, and persistence contracts for review before frontend integration.

See `backend/README.md` for local commands and `docs/PRODUCTION_RUNBOOK.md` for the automated under-$5 production path. The backend and QR+PIN session path are deployable; real youth-data use still requires approved guardian/recovery policy, secure credential distribution, encrypted off-host backups, and privacy operations.
