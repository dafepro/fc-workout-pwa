# ZoomiGo backend

**Status:** Maintained

The backend is the connected Go service for player/staff authentication,
training, safe social projections, assignments/plans, rewards, Team Lounge
authority, audit, backup, and production observability. It uses a local SQLite
file behind repository interfaces and embedded forward migrations.

## Requirements

- Go 1.26 or newer
- Docker Desktop for intentional Docker E2E and restore drills

## Commands

From `backend/`:

```text
go test ./...
go vet ./...
go build ./cmd/api
go build ./cmd/admin
go build ./cmd/backup
go run ./cmd/api
../scripts/e2e.sh
```

Ordinary changes run targeted tests. The Unix E2E script starts the real API,
SQLite migrations, PWA, and Playwright environment with no cloud dependency;
run it for release candidates or intentional periodic validation.

Health endpoints are `GET http://localhost:8080/healthz` and
`GET http://localhost:8080/readyz`. Prometheus metrics use the separately
configured private metrics listener.

## Configuration

Core variables include:

| Variable                                 | Default                 | Purpose                                         |
| ---------------------------------------- | ----------------------- | ----------------------------------------------- |
| `APP_ENV`                                | `development`           | Runtime environment label                       |
| `PORT`                                   | `8080`                  | Public API listener                             |
| `METRICS_PORT`                           | `9090`                  | Private Prometheus listener                     |
| `DATABASE_URL`                           | `file:data/zoomigo.db`  | SQLite connection string; never logged          |
| `ALLOWED_ORIGIN`                         | `http://localhost:3000` | Exact CORS origin                               |
| `TEAM_TIME_ZONE`                         | `America/Chicago`       | Team-local calendar fallback                    |
| `SHUTDOWN_TIMEOUT`                       | `10s`                   | Graceful shutdown deadline                      |
| `LOGIN_ATTEMPTS_PER_MINUTE`              | `30`                    | Per-address player/staff throttle; `0` disables |
| `GLOBAL_LOGIN_ATTEMPTS_PER_MINUTE`       | `120`                   | Global player sign-in throttle                  |
| `STAFF_GLOBAL_LOGIN_ATTEMPTS_PER_MINUTE` | `120`                   | Independent global staff throttle               |

The client address may come from `CF-Connecting-IP` only when the direct peer is
loopback/private. Player and staff global budgets are separate so a public
player flood cannot consume the staff-console allowance.

`ENABLE_E2E_FIXTURES` and `E2E_RESET_KEY` work only with the E2E-tagged binary,
`APP_ENV=e2e`, and explicit enablement. Development-access capabilities have
their own explicit gate. Normal production builds reject both.

## Persistence and deployment

Production runs one API replica and one SQLite writer on a local persistent host
path. Never mount the same database file into multiple replicas over a network
filesystem. Managed Postgres becomes relevant only when the triggers in
[../docs/FUTURE_WORK.md](../docs/FUTURE_WORK.md) are met.

The VM stack runs the API behind Caddy with hardened containers, bounded logs,
and only ports 80/443 exposed. See
[../docs/PRODUCTION_RUNBOOK.md](../docs/PRODUCTION_RUNBOOK.md).

## Backup and restore

`cmd/backup` creates consistent versioned SQLite snapshots or logical exports,
verifies checksums/integrity, encrypts to an age X25519 recipient, and restores
only to a new isolated path with current forward migrations. It refuses to
overwrite a target. See
[../docs/backend/BACKUP_AND_RESTORE.md](../docs/backend/BACKUP_AND_RESTORE.md)
and
[../docs/backend/LIVE_RESTORE_RUNBOOK.md](../docs/backend/LIVE_RESTORE_RUNBOOK.md).

## Contracts

- [../docs/backend/API.md](../docs/backend/API.md) inventories the current HTTP
  surface.
- [../docs/backend/AUTHORIZATION_MATRIX.md](../docs/backend/AUTHORIZATION_MATRIX.md)
  records access invariants.
- [../docs/DOMAIN_MODEL.md](../docs/DOMAIN_MODEL.md) explains conceptual domains;
  `migrations/` is the executable schema.
- [../docs/backend/PRODUCTION_APPROVAL_CHECKLIST.md](../docs/backend/PRODUCTION_APPROVAL_CHECKLIST.md)
  must be complete before real youth data.
