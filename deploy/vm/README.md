# StrideCrew single-VM deployment

This bundle manually deploys the Go API and its SQLite database to one Linux VM. Caddy is the only public container and obtains and renews HTTPS certificates automatically. The API has no published host port and runs as uid/gid `65532` with a read-only container filesystem, dropped Linux capabilities, and a dedicated persistent host directory.

The hosted PWA is intentionally **not** connected to this API yet. Production authentication is disabled, so all private endpoints return `401`. Do not add `VITE_API_BASE_URL` or a production token to the PWA until the QR/PIN session design is implemented and reviewed.

## Host prerequisites

- A small x86-64 or ARM64 Linux VM with Docker Engine and Docker Compose v2.
- A public DNS `A`/`AAAA` record for the API hostname pointing to the VM.
- Inbound TCP 80 and 443, UDP 443, and SSH restricted to operator addresses. Do not publish port 8080.
- Enough protected disk for the database, an on-host backup, and an isolated restore copy.
- An operator account allowed to run Docker. Treat Docker access as root-equivalent host access.

## First deployment

Run from `deploy/vm/` on the VM:

```sh
cp .env.example .env
chmod 600 .env
# Edit .env: set CADDY_SITE_ADDRESS and confirm the exact PWA_ORIGIN and host paths.

sudo ./scripts/prepare-host.sh .env
./scripts/preflight.sh .env
./scripts/deploy.sh .env
```

`prepare-host.sh` refuses broad paths and creates the three configured directories with mode `0700`, owned by the API container's numeric uid/gid. `deploy.sh` validates the Caddy configuration, builds the exact checked-out backend source, starts both services, waits for container health, and requires public HTTPS readiness.

Verify the safety lock after deployment:

```sh
curl --fail https://api.example.com/readyz
curl -i https://api.example.com/v1/me/training-entries
```

The first request should return `{"status":"ready"}`. The private request must return `401` until production authentication exists.

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

Container logs go to Docker's configured logging driver. No Caddy access log is enabled because it would retain player IP addresses and request paths by default. Configure host log rotation, security updates, disk alerts, uptime monitoring on `/readyz`, and a firewall before handling production traffic.

## Recovery and rollback boundary

Application rollback means checking out the prior reviewed source and running `deploy.sh` again. Database migrations are forward-only. Do not copy an older database over the live file. A database cutover must use the offline, retain-the-old-file procedure in `docs/backend/BACKUP_AND_RESTORE.md`; that live cutover remains a production gate.

See `docs/backend/CLOUD_VM_DEPLOYMENT.md` for the architecture and unresolved gates.
