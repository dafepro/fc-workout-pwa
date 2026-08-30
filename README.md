# ZoomiGo

ZoomiGo is a mobile-first training PWA for youth soccer players. It combines
structured workout tracking, private progress, curated rewards, and a
locked-down team experience without open chat or public performance ranking.

The repository contains the connected player PWA, a staff console, a Go API
with SQLite persistence, a shared Canvas-powered Team Lounge, production
automation, and local end-to-end test environments.

## Start here

1. Read [AGENTS.md](AGENTS.md) for the product and engineering rules.
2. Use [docs/README.md](docs/README.md) to find the maintained source of truth.
3. Check [docs/ROADMAP.md](docs/ROADMAP.md) before choosing new work.
4. Record a genuinely unresolved product or operational choice in
   [docs/OPEN_DECISIONS.md](docs/OPEN_DECISIONS.md); do not use it as a change
   log.

## Current product

Players sign in with a personal QR credential plus PIN and use three primary
destinations:

- **Today** for the current plan, Momentum, rewards, and structured training or
  rest check-ins;
- **Team** for privacy-safe progress, challenges, predefined cheers, rewards,
  and the shared Team Lounge;
- **Me** for private session history, prize inventory, security actions, and the
  avatar studio.

Staff use password, TOTP, role checks, and step-up authentication. Coaches can
manage their assigned teams, rosters, assignments, training plans, progress,
and team rewards. Platform operators can manage clubs, teams, staff accounts,
players, audit records, and the privacy-safe product-analytics overview.

The Go service is authoritative for identity, authorization, training data,
safe team projections, rewards, and Lounge permits. SQLite is intentionally
limited to one API writer. Production uses an immutable container release on a
single 1 GiB DigitalOcean VM behind Caddy and Cloudflare.

## Development

The supported automation environment is a Unix shell. From the repository
root:

```text
pnpm install --frozen-lockfile
./scripts/verify.sh
```

`./scripts/verify.sh` runs formatting, linting, type checks, unit tests, Go
checks, production builds, documentation contracts, deployment contracts, and
OpenTofu validation. Use `./scripts/verify.sh --all` only for an intentional
release-candidate pass that should also run the full Docker API/browser E2E and
VM smoke suites.

Focused workflows:

- `pnpm test:e2e:visual` runs the pinned 320 px Team Lounge image comparison;
- `./scripts/drills.sh` exercises backup, restore, cutover, rollback, credential,
  and incident-release procedures locally;
- [backend/README.md](backend/README.md) documents API development;
- [docs/PRODUCTION_RUNBOOK.md](docs/PRODUCTION_RUNBOOK.md) documents production;
- [docs/DEV_ENVIRONMENT.md](docs/DEV_ENVIRONMENT.md) documents the disposable
  preview environment.

Install the formatting hook once per clone with
`./scripts/install-git-hooks.sh`.

## Real-data boundary

Infrastructure and encrypted backup/restore paths are implemented, but the
checked-in configuration keeps real-player provisioning locked. Do not store
real youth data until every dated owner approval in
[docs/backend/PRODUCTION_APPROVAL_CHECKLIST.md](docs/backend/PRODUCTION_APPROVAL_CHECKLIST.md)
is complete and `PRODUCTION_DATA_APPROVED=true` is deliberately configured.
