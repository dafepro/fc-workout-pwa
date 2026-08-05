# StrideCrew backend

This directory contains the milestone 2 Go service foundation. It provides configuration validation, safe HTTP defaults, database-backed readiness, embedded migrations, contextual-reaction persistence and inbox endpoints, and a production container build.

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
go run ./cmd/api
docker compose -f compose.e2e.yaml up --build --abort-on-container-exit --exit-code-from e2e
```

The tagged E2E suite is dual-mode. With `E2E_BASE_URL` set by Compose it tests the separately running API container. Without that variable it uses a no-Docker fallback with a temporary real SQLite file and the real HTTP handler. The Docker run remains the completion gate when Docker is available.

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

## Current boundary

- No production authentication exists yet.
- E2E bearer identities are local fixtures, not a production authentication design.
- Training-entry persistence and frontend API integration are still pending.
- The PWA continues using device-local persistence.
- API, authorization, and data-model drafts are in `docs/backend/`.
