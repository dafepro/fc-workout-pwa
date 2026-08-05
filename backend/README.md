# StrideCrew backend

This directory contains the milestone 2 Go service foundation. It provides configuration validation, safe HTTP defaults, database-backed readiness, embedded migrations, private training-entry persistence, contextual-reaction endpoints, and a production container build.

## Requirements

- Go 1.26 or newer
- Docker Desktop for the canonical end-to-end suite

## Commands

From `backend/`:

```text
go test ./...
go test -tags=e2e ./e2e
go vet ./...
go build ./cmd/api
go build ./cmd/backup
go run ./cmd/api
powershell -File ..\scripts\e2e.ps1
```

The script builds the real API, SQLite, PWA, and Playwright browser environment; runs the API suite and browser feedback flows in sequence; then tears the stack down. The tagged Go E2E suite is also dual-mode: without `E2E_BASE_URL`, it uses a no-Docker fallback with a temporary real SQLite file and the real HTTP handler. The Docker run remains the completion gate when Docker is available.

Health endpoints:

- `GET http://localhost:8080/healthz`
- `GET http://localhost:8080/readyz`

## Configuration

| Variable           | Default                   | Purpose                                    |
| ------------------ | ------------------------- | ------------------------------------------ |
| `APP_ENV`          | `development`             | Runtime environment label                  |
| `PORT`             | `8080`                    | HTTP listener port                         |
| `DATABASE_URL`     | `file:data/stridecrew.db` | SQLite connection string; never logged     |
| `ALLOWED_ORIGIN`   | `http://localhost:3000`   | Exact frontend origin allowed by CORS      |
| `TEAM_TIME_ZONE`   | `America/Chicago`         | IANA zone used for team-local daily limits |
| `SHUTDOWN_TIMEOUT` | `10s`                     | Graceful HTTP shutdown deadline            |

`ENABLE_E2E_FIXTURES` and `E2E_RESET_KEY` exist only for the local E2E stack. Fixtures require all of an `e2e`-tagged binary, `APP_ENV=e2e`, and the explicit enable flag. A normal production build rejects them.

## SQLite deployment shape

The API uses `database/sql` with the CGo-free `modernc.org/sqlite` driver. The initial cloud deployment should run one API replica in one region with the database file on a mounted persistent volume. This keeps the image portable and the operational footprint small.

SQLite permits many readers but serializes writes. Do not mount the same database file into multiple API replicas. Move the repository adapter to managed Postgres when horizontal API replicas, multi-region writes, stronger managed failover/PITR, or materially higher concurrent write volume becomes necessary. Backups and a restore drill are required before production youth data is stored.

The portable manual deployment bundle is in `deploy/vm/`. It runs the API behind Caddy on one Linux VM, persists SQLite in an explicit protected host directory, and exposes only ports 80/443. See `docs/backend/CLOUD_VM_DEPLOYMENT.md` for the architecture and safety gates.

## Backup and restore

`cmd/backup` creates a versioned `tar.gz` archive from a consistent live SQLite snapshot, verifies checksums and database integrity, and restores only into a new isolated database path. Restore applies all missing embedded forward migrations and refuses to overwrite an existing database. See `docs/backend/BACKUP_AND_RESTORE.md` for commands, the Docker drill, and the encryption/off-host work still required before production data.

## Current boundary

- No production authentication exists yet.
- E2E bearer identities are local fixtures, not a production authentication design.
- Training-entry create/list/detail/delete and contextual reactions use the real Go/SQLite API in the Docker E2E environment.
- The PWA selects the real API with `VITE_API_BASE_URL` and `VITE_API_TOKEN`; without both, the private prototype deployment retains its device-local adapter.
- Safe Team/leaderboard projections, production authentication, cursor pagination, and hosted API operations remain pending.
- API, authorization, and data-model drafts are in `docs/backend/`.
- The migration-aware flat-file backup CLI and restore drill are implemented; encryption, retention automation, audited off-host storage, and the live-cutover runbook remain production gates.
- The VM stack is manually deployable and production routes fail closed; do not connect the hosted PWA or persist real youth data until production authentication, encrypted off-host backup, and privacy operations are complete.
