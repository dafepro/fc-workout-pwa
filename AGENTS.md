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
- Boy Scout rule: leave the code better than you found it. Fix the messes you touch — dedupe, delete dead code, collapse repetition — rather than adding a second copy beside them. Prefer changes that remove lines; if adding a feature means a file grows, shrink the duplication it exposed.
- Comment only to explain _why_. One line where possible, and only where the code cannot say it itself. Delete comments that restate the code.
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

## Operator hints

Hard-won specifics that are easy to lose hours on. Host addresses and key
material live in `infra/` outputs and the `production` environment, not here.

**GitHub.** The repo is `dafepro`; your `gh` session is probably a different
account with no admin, so write APIs return `403`. `git push` already works via a
repo-local credential helper. The `gh` API needs the token passed explicitly:
`GH_TOKEN="$(gh auth token -h github.com -u dafepro)" gh ...`.

**Releases are manual.** A push to `main` verifies and publishes an image but
never deploys. To ship, dispatch `release.yml` with the 40-character
`release_sha` whose image was already published; it never rebuilds the image and
refuses a SHA with no published image or one that is not an ancestor of `main`.
`PRODUCTION_DEPLOY_ENABLED` must be _repository_-scoped: a job-level `if` is
evaluated before the environment resolves, so an environment-scoped variable is
invisible there and the job silently skips.

**SSH.** Connect as `zoomigo`, not root. The host key is pinned in
`infra/known_hosts`, not `~/.ssh/known_hosts` — pass
`-o UserKnownHostsFile=infra/known_hosts` or the connection dies with "Host key
verification failed". Pin, don't weaken `StrictHostKeyChecking`. Use the
reserved IP (it survives Droplet rebuilds), not the Droplet's own. zsh does not
word-split unquoted variables, so `SSH="ssh -i ..."; $SSH host cmd` fails — put
the invocation in a small `.sh` wrapper. The key is `~/.ssh/id_ed25519`;
`zoomigo_github_deploy` is CI's and the host rejects it.

**Admin commands on the host.** The `admin` service sits behind a Compose
profile, so it needs all of
`cd /opt/app/deploy/vm && sudo -n docker compose --env-file .env --profile operations run --rm --no-TTY admin <subcommand>`.
Without `--profile operations` Compose claims the service does not exist.

**A complete deploy can still fail the release.** `production-check.sh` runs
last and fails on `/var/run/reboot-required`, so unattended kernel/libc updates
turn an otherwise finished deploy red. Reboot the VM and re-dispatch; the
containers are `restart: unless-stopped` and come back without help.

**Rebuilding a table other tables point at.** SQLite cannot alter a `CHECK` or
a `NOT NULL`, so changing one means rebuilding the table -- and dropping a
parent while foreign keys are enforced counts as deleting every row a child
references. `PRAGMA defer_foreign_keys` does not save it: the drop increments
the violation counter and renaming a replacement into place never decrements
it, so the commit fails on any database with rows and passes on an empty one.
Mark such a migration with `-- zoomigo:table-rebuild` on its first line;
`internal/database` then runs SQLite's documented sequence around it. Test the
migration against a _populated_ database or it proves nothing.

**Schema literals that must be bumped.** `internal/database/database_test.go`
asserts an exact `schema_migrations` count, so any new migration fails it until
that number changes. `auth_audit_events.event_type` is `CHECK`-constrained to
six values, so a new event type means rebuilding the table. `accounts.status`
accepts only `active` and `disabled`.

**Host with no working sshd.** DigitalOcean's Recovery ISO needs no password.
Its sshd is publickey-only, so the root password it prints will not work over the
network; use the web console. Mount the real disk read-only to preserve evidence.
Rescue root is a small overlay but copies the Droplet's hostname, so `hostname`
alone will fool you.

**CI gates that bite.** `prettier --check .` covers everything, including
`.github/workflows/*.yml` and every `.md` — a long markdown table cell breaks the
build. `scripts/contracts.mjs` matches literal _substrings_, so a commented-out
line still satisfies it; the guard is weaker than it looks. `scripts/verify.sh`
runs no shellcheck; `sh -n` is the only shell syntax gate.

**Cloudflare.** The API token is account-owned, so `/user/tokens/verify` returns
`401 Invalid API Token` even when the token is fine — use
`/accounts/<id>/tokens/verify`. On `/accounts/<id>/workers/*`, `403 code 10000`
means missing Workers Scripts: Edit; `403 code 9109` on `/accounts/<id>` is only
a missing Account Settings: Read and does not matter here.

**Landmines already hit.** cloud-init runs `bootcmd` _before_ `growpart`, so
anything consuming disk there runs against the un-grown partition — use the
`swap:` module. `install` under `sudo` changes the destination's owner, which
once rewrote a `zoomigo:zoomigo` file as `root:root` and broke every release at
the next unprivileged step. `deploy.sh`'s public readiness probe hairpins through
Cloudflare, so check the container locally first or an edge misconfig looks like
a crashed app.
