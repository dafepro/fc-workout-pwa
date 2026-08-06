# ZoomiGo single-VM deployment

This bundle manually deploys the Go API and its SQLite database to one Linux VM. Caddy is the only public container and obtains and renews HTTPS certificates automatically. The API has no published host port and runs as uid/gid `65532` with a read-only container filesystem, dropped Linux capabilities, bounded resources/logs, and a dedicated persistent host directory.

The concrete `$4.80/month` DigitalOcean operator checklist is in `docs/backend/DIGITALOCEAN_UNDER_5_RUNBOOK.md`.

The production PWA runs on Cloudflare Workers' free tier and connects through its own same-origin session gateway. Configure the Worker binding `ZOOMIGO_API_BASE_URL=https://api.example.com`; never place an API token in a `VITE_*` variable or browser bundle. The existing Sites deployment remains preview-only.

## Host prerequisites

- A small x86-64 Linux VM with Docker Engine and Docker Compose v2. The published first-deployment image currently targets `linux/amd64`.
- A public DNS `A`/`AAAA` record for the API hostname pointing to the VM.
- Inbound TCP 80 and 443, UDP 443, and SSH restricted to operator addresses. Do not publish port 8080.
- Enough protected disk for the database, an on-host backup, and an isolated restore copy.
- `rclone` for encrypted uploads to private S3-compatible storage. The first provider is Cloudflare R2 and the documented bucket is `zoomigo-backups`.
- An operator account allowed to run Docker. Treat Docker access as root-equivalent host access.

## First deployment

For an existing pre-rebrand host, do not copy `.env.example` over the live
environment. Check out the reviewed native ZoomiGo revision and run the guarded
one-time copy first:

```sh
cd /opt/app/deploy/vm
sudo ./scripts/migrate-legacy-install.sh .env
```

It creates a verified encrypted backup and preserves the source database. Pin
the new immutable image/version and verify the new service before retiring any
old state. See the full DigitalOcean runbook for the rollback boundary.

For a new host, run from `deploy/vm/` on the VM:

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

`prepare-small-vm.sh` adds a 1 GiB swap safety cushion for the 512 MiB plan. `prepare-host.sh` refuses broad paths and creates the configured directories with mode `0700`, owned by the API container's numeric uid/gid. For production, `deploy.sh` pulls the immutable `sha-*` image that already passed CI; a `zoomigo-api:*` image name retains the local source-build path used by the VM smoke test.

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
  --team-id TEAM_ID --first-name Test --last-initial P \
  --login-url "https://app.example.com/login" \
  --qr-output /output/test-player-login.png \
  --test-only
```

Use an allowed four-digit PIN and distribute it separately from the QR code. Repeated digits and `1234`/`4321` are rejected. Real-player provisioning remains locked while `PRODUCTION_DATA_APPROVED=false`; `--test-only` asserts the identity is disposable. Set it to `true` only after the production approval checklist is complete. `rotate-player-login` issues a unique replacement and revokes all prior credentials/sessions; `revoke-player-login` disables current credentials/sessions. The QR URL holds its 256-bit secret after `#`, so it is not sent with the initial web request.

## Update

Routine production updates should use the ordered release entrypoint. Both the
protected GitHub environment and an operator fallback decrypt the same bundle
and call it:

```sh
./deploy/release/release.sh /secure/path/zoomigo-operator-age-identity RELEASE_SHA
```

During an Actions outage where the immutable image was not published, log in to
GHCR through standard input and set `PUBLISH_API_IMAGE=true`; the full runbook
contains the exact commands. The publisher refuses a dirty worktree or a SHA
other than the checked-out commit.

That command completes a verified VM backup, pins the checkout and image to the
same full SHA, deploys and checks the API, then deploys the Worker. The database
lives outside the container and embedded forward migrations run before the API
becomes ready. Run only one API replica against this SQLite file.

## Backup and restore drill

```sh
./scripts/backup.sh .env
./scripts/restore-drill.sh .env \
  zoomigo-backup-YYYYMMDDTHHMMSSZ-v1.tar.gz.age \
  zoomigo-backup-identity.txt
```

The restore drill authenticates and decrypts the age envelope, verifies the archive, and creates a new database under `RESTORE_DIR`; it never replaces the live database. Only the public age recipient belongs on the VM. Supply the identity temporarily for a drill, then remove it immediately. Scheduled jobs upload only encrypted archives through the provider-neutral S3 configuration in root-owned `/etc/zoomigo/backup-s3.env`.

## Operations

```sh
docker compose --env-file .env -f compose.yaml ps
docker compose --env-file .env -f compose.yaml logs --tail 100 api caddy
docker compose --env-file .env -f compose.yaml restart api
```

Container logs use Docker's bounded local driver (three files of at most 5 MiB per service). No Caddy access log is enabled because it would retain player IP addresses and request paths by default. Configure security updates, disk alerts, uptime monitoring on `/readyz`, and a firewall before handling production traffic.

## Recovery and rollback boundary

Application rollback means checking out the prior reviewed source and running `deploy.sh` again. Database migrations are forward-only. Do not copy an older database over the live file. A database cutover must use `docs/backend/LIVE_RESTORE_RUNBOOK.md`, retain the old live file, and pass post-cutover checks.

See `docs/backend/CLOUD_VM_DEPLOYMENT.md` for the architecture and unresolved gates.
