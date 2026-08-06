# StrideCrew single-VM deployment

This bundle manually deploys the Go API and its SQLite database to one Linux VM. Caddy is the only public container and obtains and renews HTTPS certificates automatically. The API has no published host port and runs as uid/gid `65532` with a read-only container filesystem, dropped Linux capabilities, bounded resources/logs, and a dedicated persistent host directory.

The concrete `$4.80/month` DigitalOcean operator checklist is in `docs/backend/DIGITALOCEAN_UNDER_5_RUNBOOK.md`.

The production PWA runs on Cloudflare Workers' free tier and connects through its own same-origin session gateway. Configure the Worker binding `STRIDECREW_API_BASE_URL=https://api.example.com`; never place an API token in a `VITE_*` variable or browser bundle. The existing Sites deployment remains preview-only.

## Host prerequisites

- A small x86-64 Linux VM with Docker Engine and Docker Compose v2. The published first-deployment image currently targets `linux/amd64`.
- A public DNS `A`/`AAAA` record for the API hostname pointing to the VM.
- Inbound TCP 80 and 443, UDP 443, and SSH restricted to operator addresses. Do not publish port 8080.
- Enough protected disk for the database, an on-host backup, and an isolated restore copy.
- An operator account allowed to run Docker. Treat Docker access as root-equivalent host access.

## First deployment

Run from `deploy/vm/` on the VM:

```sh
cp .env.example .env
chmod 600 .env
# Edit .env: set the immutable API_IMAGE/APP_VERSION, CADDY_SITE_ADDRESS,
# exact PWA_ORIGIN, and host paths.

sudo ./scripts/prepare-small-vm.sh
sudo ./scripts/prepare-host.sh .env
./scripts/preflight.sh .env
./scripts/deploy.sh .env
```

`prepare-small-vm.sh` adds a 1 GiB swap safety cushion for the 512 MiB plan. `prepare-host.sh` refuses broad paths and creates the configured directories with mode `0700`, owned by the API container's numeric uid/gid. For production, `deploy.sh` pulls the immutable `sha-*` image that already passed CI; a `stridecrew-api:*` image name retains the local source-build path used by the VM smoke test.

Verify the safety lock after deployment:

```sh
curl --fail https://api.example.com/readyz
curl -i https://api.example.com/v1/me/training-entries
```

The first request should return `{"status":"ready"}`. The private request must return `401` without a valid session.

## Create a team and player login

The operations-only admin container reads and writes the same SQLite file without exposing an HTTP admin endpoint. Keep its JSON output and QR files private.

```sh
docker compose --env-file .env -f compose.yaml --profile operations run --rm admin \
  bootstrap-team --club-name "Hill Striders" --team-name "Hill Striders U12" \
  --season-id "2026-fall" --time-zone "America/Chicago"

docker compose --env-file .env -f compose.yaml \
  --profile operations run --rm admin provision-player \
  --team-id TEAM_ID --first-name Mason --last-initial C \
  --login-url "https://app.example.com/login" \
  --qr-output /output/mason-login.png
```

Use a non-obvious six-digit PIN and distribute it separately from the QR code. `rotate-player-login` issues a replacement and revokes all prior credentials/sessions; `revoke-player-login` disables current credentials/sessions. The QR URL holds its secret after `#`, so it is not sent with the initial web request.

## Update

Before an application update, create a verified backup. Then check out the reviewed revision and run the same deploy script:

```sh
./scripts/backup.sh .env
git pull --ff-only
./scripts/deploy.sh .env
```

The database lives outside the container and embedded forward migrations run before the API becomes ready. Run only one API replica against this SQLite file.

## Backup and restore drill

```sh
./scripts/backup.sh .env
./scripts/restore-drill.sh .env stridecrew-backup-YYYYMMDDTHHMMSSZ-v1.tar.gz
```

The restore drill verifies the archive and creates a new database under `RESTORE_DIR`; it never replaces the live database. Current v1 archives are unencrypted and must remain on the protected host. Off-host copies are blocked until encryption, key management, retention, and operator auditing are implemented.

## Operations

```sh
docker compose --env-file .env -f compose.yaml ps
docker compose --env-file .env -f compose.yaml logs --tail 100 api caddy
docker compose --env-file .env -f compose.yaml restart api
```

Container logs use Docker's bounded local driver (three files of at most 5 MiB per service). No Caddy access log is enabled because it would retain player IP addresses and request paths by default. Configure security updates, disk alerts, uptime monitoring on `/readyz`, and a firewall before handling production traffic.

## Recovery and rollback boundary

Application rollback means checking out the prior reviewed source and running `deploy.sh` again. Database migrations are forward-only. Do not copy an older database over the live file. A database cutover must use the offline, retain-the-old-file procedure in `docs/backend/BACKUP_AND_RESTORE.md`; that live cutover remains a production gate.

See `docs/backend/CLOUD_VM_DEPLOYMENT.md` for the architecture and unresolved gates.
