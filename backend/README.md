# ZoomiGo backend

This directory contains the milestone 2 Go service foundation. It provides configuration validation, safe HTTP defaults, database-backed readiness, embedded migrations, private training-entry persistence, contextual-reaction endpoints, and a production container build.

## Requirements

- Go 1.26 or newer
- Docker Desktop for the canonical end-to-end suite

## Commands

From `backend/`:

```text
go test ./...
go vet ./...
go build ./cmd/api
go build ./cmd/backup
go run ./cmd/api
../scripts/e2e.sh
```

The Unix script builds the real API, SQLite, PWA, and Playwright browser environment; runs the API suite and browser feedback flows in sequence; then tears the stack down. The tagged Go E2E suite is also dual-mode: without `E2E_BASE_URL`, it uses a no-Docker fallback with a temporary real SQLite file and the real HTTP handler. Run the full Docker suite intentionally for periodic or release-candidate validation; ordinary changes use targeted tests.

Health endpoints:

- `GET http://localhost:8080/healthz`
- `GET http://localhost:8080/readyz`

## Configuration

| Variable                           | Default                 | Purpose                                                   |
| ---------------------------------- | ----------------------- | --------------------------------------------------------- |
| `APP_ENV`                          | `development`           | Runtime environment label                                 |
| `PORT`                             | `8080`                  | HTTP listener port                                        |
| `DATABASE_URL`                     | `file:data/zoomigo.db`  | SQLite connection string; never logged                    |
| `ALLOWED_ORIGIN`                   | `http://localhost:3000` | Exact frontend origin allowed by CORS                     |
| `TEAM_TIME_ZONE`                   | `America/Chicago`       | IANA zone used for team-local calendar rules              |
| `SHUTDOWN_TIMEOUT`                 | `10s`                   | Graceful HTTP shutdown deadline                           |
| `LOGIN_ATTEMPTS_PER_MINUTE`        | `30`                    | Sign-in attempts allowed per client address; `0` disables |
| `GLOBAL_LOGIN_ATTEMPTS_PER_MINUTE` | `120`                   | Sign-in attempts allowed across all clients; `0` disables |

The login throttle keys on `CF-Connecting-IP`, and honours it only when the
request arrives from a loopback or private peer. The DigitalOcean firewall opens
443 to Cloudflare ranges only, so at the origin that header is always set by
Cloudflare and cannot be chosen by a client. The global limit is the backstop
for a spray spread across many addresses, which per-address budgets cannot see.

`ENABLE_E2E_FIXTURES` and `E2E_RESET_KEY` exist only for the local E2E stack. Fixtures require all of an `e2e`-tagged binary, `APP_ENV=e2e`, and the explicit enable flag. A normal production build rejects them.

## SQLite deployment shape

The API uses `database/sql` with the CGo-free `modernc.org/sqlite` driver. The initial cloud deployment should run one API replica in one region with the database file on a mounted persistent volume. This keeps the image portable and the operational footprint small.

SQLite permits many readers but serializes writes. Do not mount the same database file into multiple API replicas. Move the repository adapter to managed Postgres when horizontal API replicas, multi-region writes, stronger managed failover/PITR, or materially higher concurrent write volume becomes necessary. Backups and a restore drill are required before production youth data is stored.

The production stack in `deploy/vm/` runs the API behind Caddy on one Linux VM, persists SQLite in an explicit protected host directory, and exposes only ports 80/443. See `docs/PRODUCTION_RUNBOOK.md` for provisioning, release, and safety gates.

## Backup and restore

`cmd/backup` creates a versioned archive from a consistent live SQLite snapshot, verifies checksums and database integrity, encrypts it to an age X25519 recipient, and restores only into a new isolated database path. Restore applies all missing embedded forward migrations and refuses to overwrite an existing database. See `docs/backend/BACKUP_AND_RESTORE.md` for commands and the Docker drill.

## Current boundary

- Production player authentication uses a unique reissuable 256-bit QR credential plus exactly four PIN digits, Argon2id verification, bounded password work, throttling, and revocable opaque sessions.
- E2E bearer identities remain local fixtures for older API-focused scenarios; QR+PIN session lifecycle coverage uses the real session service and database.
- Training-entry create/list/detail/delete and contextual reactions use the real Go/SQLite API in the Docker E2E environment.
- The PWA worker selects the real API with `ZOOMIGO_API_BASE_URL` (temporarily accepting `ZOOMIGO_API_BASE_URL` as a compatibility alias), keeps the bearer in an HTTP-only same-origin cookie, and uses its local adapter only when that binding is absent.
- Safe Team/leaderboard projections, cursor pagination, guardian recovery policy, and hosted API operations remain pending.
- API, authorization, and data-model drafts are in `docs/backend/`.
- The migration-aware flat-file backup CLI, age encryption, bounded local retention, private R2 upload, isolated restore drill, and live-cutover runbook are implemented. Key custody, R2 lifecycle, and launch policies still require owner approval.
- The VM stack, connected login path, age-encrypted backup, and private R2 upload path are manually deployable. Do not persist real youth data until the owner approvals in `docs/backend/PRODUCTION_APPROVAL_CHECKLIST.md` are complete.
