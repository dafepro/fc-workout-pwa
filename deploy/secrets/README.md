# Production secrets

ZoomiGo keeps no local, plaintext, or encrypted-bundle copy of production
credentials. GitHub Actions secrets and variables in the protected
`production` environment are the only place these credentials live.
`.github/workflows/backend-image.yml` and `.github/workflows/infra.yml`
read them directly; nothing decrypts a file to reach them.

## GitHub `production` environment secrets

| Secret                                                               | Used by                 | Purpose                                                                                                                                                                                                                                     |
| -------------------------------------------------------------------- | ----------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `ZOOMIGO_DEPLOY_SSH_KEY`                                             | release, infra          | Private half of the dedicated deploy key. The public half is derived with `ssh-keygen -y` at plan/apply and release time.                                                                                                                   |
| `CLOUDFLARE_API_TOKEN`                                               | release, infra          | Edits DNS for `quicktrack.cc` and deploys Workers/custom domains.                                                                                                                                                                           |
| `CLOUDFLARE_ACCOUNT_ID`                                              | release                 | Cloudflare account for the Worker deploy.                                                                                                                                                                                                   |
| `BACKUP_S3_ACCESS_KEY_ID` / `BACKUP_S3_SECRET_ACCESS_KEY`            | release                 | R2 credentials installed on the VM for encrypted-backup uploads.                                                                                                                                                                            |
| `DIGITALOCEAN_TOKEN`                                                 | infra                   | Manages the Droplet, firewall, monitoring, and reserved IP.                                                                                                                                                                                 |
| `TF_STATE_ACCESS_KEY_ID` / `TF_STATE_SECRET_ACCESS_KEY`              | release, infra          | R2 credentials for the OpenTofu state bucket (`zoomigo-tfstate`).                                                                                                                                                                           |
| `BACKUP_AGE_IDENTITY`                                                | on-demand restore drill | Private half of the one remaining `age` identity; decrypts SQLite backups.                                                                                                                                                                  |
| `STAFF_SECRET_KEY`                                                   | release                 | 32 base64 bytes encrypting stored staff second factors. Rotating it makes every enrolled authenticator unreadable, so every staff account must re-enrol. Absent, the API refuses staff sign-in rather than running without a second factor. |
| `ANALYTICS_SUBJECT_KEY`                                              | release                 | At least 32 random bytes used only as the HMAC key for pseudonymous player and team analytics keys. Rotating it intentionally breaks historical user continuity.                                                                            |
| `GRAFANA_DEV_LOGS_TOKEN` / `GRAFANA_DEV_METRICS_TOKEN`               | dev release             | Separate Grafana Cloud write tokens scoped only to `logs:write` and `metrics:write` for dev.                                                                                                                                                |
| `GRAFANA_PRODUCTION_LOGS_TOKEN` / `GRAFANA_PRODUCTION_METRICS_TOKEN` | release                 | Separate Grafana Cloud write tokens scoped only to `logs:write` and `metrics:write` for production. Keep unset until the production host passes admission.                                                                                  |
| `GRAFANA_READ_TOKEN`                                                 | observability query     | Stack-scoped diagnostic token with only `logs:read` and `metrics:read`; it is never installed on a VM.                                                                                                                                      |

## GitHub `production` environment variables (not secret)

| Variable                                                                              | Purpose                                                                                                                                                                                                                                                              |
| ------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `DEPLOY_HOST`                                                                         | Droplet reserved IPv4 address. Updated by `infra/digitalocean/adopt-host.mjs`.                                                                                                                                                                                       |
| `DEPLOY_USER`                                                                         | SSH login user on the VM (`zoomigo`).                                                                                                                                                                                                                                |
| `ZOOMIGO_API_BASE_URL`                                                                | Public API origin, e.g. `https://api.quicktrack.cc`.                                                                                                                                                                                                                 |
| `BACKUP_AGE_RECIPIENT`                                                                | Public `age1...` recipient for encrypting SQLite backups.                                                                                                                                                                                                            |
| `BACKUP_S3_ENDPOINT` / `BACKUP_S3_BUCKET` / `BACKUP_S3_PROVIDER` / `BACKUP_S3_REGION` | R2 backup bucket connection details.                                                                                                                                                                                                                                 |
| `TF_STATE_BUCKET` / `TF_STATE_ENDPOINT`                                               | R2 state bucket connection details.                                                                                                                                                                                                                                  |
| `CLOUDFLARE_ZONE_ID`                                                                  | Zone ID for `quicktrack.cc`.                                                                                                                                                                                                                                         |
| `SSH_SOURCE_ADDRESSES`                                                                | OpenTofu list literal. Normally `["0.0.0.0/0", "::/0"]` — neither the operator's laptop nor the CI runner has a stable IP, so SSH is protected by key-only auth instead of a source-IP allowlist.                                                                    |
| `ALERT_EMAIL_ADDRESSES`                                                               | OpenTofu list literal, e.g. `["ops@example.net"]`. One or more operator email addresses for CPU/memory/disk alerts.                                                                                                                                                  |
| `OPERATOR_SSH_PUBLIC_KEY`                                                             | Optional. Your own public key (not secret), authorized on the `zoomigo` user alongside the dedicated deploy key, for direct troubleshooting SSH access. Leave unset to skip.                                                                                         |
| `PLAYER_LOGIN_URL` / `STAFF_SETUP_URL`                                                | Absolute https URLs on the PWA hostname. The console builds a player's QR link and a coach's one-time setup link from these.                                                                                                                                         |
| `PRODUCTION_DATA_APPROVED`                                                            | `true` allows the console and the CLI to create real player accounts. Keep it unset or `false` until the approval checklist is recorded.                                                                                                                             |
| `PRODUCTION_DEPLOY_ENABLED`                                                           | Repository-scoped, not environment-scoped (a job-level `if` cannot see environment variables). Kill switch: releases also require dispatching the workflow with `deploy: true`, so `true` here never deploys on its own. Set to anything else to block all releases. |
| `ANALYTICS_D1_DATABASE_ID`                                                            | Optional D1 database UUID. When absent, the release removes the placeholder binding and analytics remains off. Setting it enables collection and requires `ANALYTICS_SUBJECT_KEY`.                                                                                   |
| `DEV_OBSERVABILITY_ENABLED` / `PRODUCTION_OBSERVABILITY_ENABLED`                      | Explicit per-environment collector switches. Keep production false on the current 512 MiB host.                                                                                                                                                                      |
| `GRAFANA_DEV_LOGS_URL` / `GRAFANA_DEV_LOGS_USERNAME`                                  | Dev Loki push endpoint and stack username.                                                                                                                                                                                                                           |
| `GRAFANA_DEV_METRICS_URL` / `GRAFANA_DEV_METRICS_USERNAME`                            | Dev Prometheus remote-write endpoint and stack username.                                                                                                                                                                                                             |
| `GRAFANA_PRODUCTION_LOGS_URL` / `GRAFANA_PRODUCTION_LOGS_USERNAME`                    | Production Loki push endpoint and stack username.                                                                                                                                                                                                                    |
| `GRAFANA_PRODUCTION_METRICS_URL` / `GRAFANA_PRODUCTION_METRICS_USERNAME`              | Production Prometheus remote-write endpoint and stack username.                                                                                                                                                                                                      |
| `GRAFANA_LOGS_QUERY_URL` / `GRAFANA_LOGS_USERNAME`                                    | Loki query-range endpoint and read username used only by `observability-query.yml`.                                                                                                                                                                                  |
| `GRAFANA_METRICS_QUERY_URL` / `GRAFANA_METRICS_USERNAME`                              | Prometheus query-range endpoint and read username used only by `observability-query.yml`.                                                                                                                                                                            |

Set these with `gh secret set NAME --env production` and
`gh variable set NAME --env production --body VALUE`.

## The one remaining `age` identity

`age` now protects exactly one thing: SQLite backup archives at rest in R2.
There is no "operator identity" or "CI identity" for deployment secrets
anymore, because there is no bundle to decrypt.

One-time setup:

```sh
age-keygen -o backup-identity.txt
```

The file's `# public key:` comment line is `BACKUP_AGE_RECIPIENT` (a plain
GitHub variable). The `AGE-SECRET-KEY-...` line is `BACKUP_AGE_IDENTITY` (a
GitHub secret, only needed for a restore drill or local restore). Store that
secret in GitHub, then keep exactly one offline copy of `backup-identity.txt`
somewhere durable outside GitHub — a safe, a second password manager entry,
printed and locked away — for the doomsday case of losing GitHub account
access. This is a one-time step, not a rotation pipeline. Delete the local
file once both copies exist.

## Rotating a credential

Rotate a credential by creating the new value at its provider, updating the
matching GitHub secret with `gh secret set`, and confirming the next release
or `infra.yml` run succeeds before revoking the old value. Nothing needs to
be resealed or recommitted, because nothing is committed.
