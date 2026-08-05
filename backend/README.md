# StrideCrew backend

This directory contains the milestone 2 Go service foundation. It currently provides configuration validation, safe HTTP defaults, liveness/readiness endpoints, pure authorization and reaction-domain rules, schema migrations, and a production container build. Training and reaction HTTP endpoints are intentionally deferred until the draft contract is reviewed.

## Requirements

- Go 1.26 or newer
- SQLite tooling for migration development (the Go database adapter is not selected yet)

## Commands

From `backend/`:

```text
go test ./...
go vet ./...
go build ./cmd/api
go run ./cmd/api
```

Health endpoints:

- `GET http://localhost:8080/healthz`
- `GET http://localhost:8080/readyz`

## Configuration

| Variable           | Default                   | Purpose                                           |
| ------------------ | ------------------------- | ------------------------------------------------- |
| `APP_ENV`          | `development`             | Runtime environment label                         |
| `PORT`             | `8080`                    | HTTP listener port                                |
| `DATABASE_URL`     | `file:data/stridecrew.db` | Future repository connection string; never logged |
| `ALLOWED_ORIGIN`   | `http://localhost:3000`   | Exact frontend origin allowed by CORS             |
| `TEAM_TIME_ZONE`   | `America/Chicago`         | IANA zone used for team-local daily limits        |
| `SHUTDOWN_TIMEOUT` | `10s`                     | Graceful HTTP shutdown deadline                   |

## Current boundary

- No production authentication exists yet.
- No database driver has been selected or added.
- `/readyz` reports process readiness until the repository layer is connected.
- The PWA continues using device-local persistence.
- API, authorization, and data-model drafts are in `docs/backend/`.
