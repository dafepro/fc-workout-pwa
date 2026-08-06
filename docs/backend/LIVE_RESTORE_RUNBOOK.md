# Offline live restore and rollback runbook

This procedure replaces the live SQLite database only during an approved recovery window. It is intentionally separate from the routine restore drill. Rehearse it with test-only data and record the elapsed time before real youth data is allowed.

## Preconditions

- Two adults know the recovery is occurring: the operator and the recovery-key custodian.
- The selected `.tar.gz.age` archive is present in `BACKUP_DIR`, its source and timestamp are recorded, and the matching age identity is available temporarily in `RESTORE_DIR`.
- The checked-out application revision supports every migration in the archive.
- A fresh encrypted backup of the current live database has completed and uploaded to R2.
- The maintenance window permits the API and PWA to be unavailable.
- All paths below are copied from the protected VM `.env`; never substitute a broad directory or a glob.

## 1. Restore and verify in isolation

From `/opt/stridecrew/deploy/vm`:

```sh
sudo ./scripts/restore-drill.sh .env \
  stridecrew-backup-YYYYMMDDTHHMMSSZ-v1.tar.gz.age \
  stridecrew-backup-identity.txt
```

Record the exact restored database filename printed by the command. It must be beneath `RESTORE_DIR`. Do not continue if envelope authentication, checksums, integrity, foreign keys, migration compatibility, or safe counts fail.

## 2. Enter the offline window

Resolve and record the exact paths:

```sh
DATA_DIR=/var/lib/stridecrew/data
RESTORE_DIR=/var/lib/stridecrew/restore
RESTORED_DB="$RESTORE_DIR/restore-drill-YYYYMMDDTHHMMSSZ.db"
ROLLBACK_DB="$DATA_DIR/stridecrew.pre-restore-YYYYMMDDTHHMMSSZ.db"
```

Confirm each value is an absolute, specific file beneath the intended StrideCrew directory. Then stop public traffic and the writer:

```sh
docker compose --env-file .env -f compose.yaml stop caddy api
docker compose --env-file .env -f compose.yaml ps
```

Do not continue if `api` is still running.

## 3. Retain the old live database and install the restored copy

Move the exact live database and any SQLite sidecars to uniquely named rollback files. Never overwrite an existing rollback file.

```sh
sudo mv -- "$DATA_DIR/stridecrew.db" "$ROLLBACK_DB"
if [ -e "$DATA_DIR/stridecrew.db-wal" ]; then
  sudo mv -- "$DATA_DIR/stridecrew.db-wal" "$ROLLBACK_DB-wal"
fi
if [ -e "$DATA_DIR/stridecrew.db-shm" ]; then
  sudo mv -- "$DATA_DIR/stridecrew.db-shm" "$ROLLBACK_DB-shm"
fi
sudo install -m 0600 -o 65532 -g 65532 "$RESTORED_DB" "$DATA_DIR/stridecrew.db"
```

Start the API and proxy:

```sh
docker compose --env-file .env -f compose.yaml up -d --wait --no-build api caddy
curl --fail https://api.example.com/readyz
curl -i https://api.example.com/v1/me/training-entries
```

Readiness must succeed and the unauthenticated private request must return `401`. Complete an approved test login and private read. Record the end time and observed recovery duration.

## 4. Immediate rollback if verification fails

Keep traffic stopped while rolling back:

```sh
docker compose --env-file .env -f compose.yaml stop caddy api
sudo mv -- "$DATA_DIR/stridecrew.db" "$RESTORE_DIR/failed-cutover-YYYYMMDDTHHMMSSZ.db"
sudo mv -- "$ROLLBACK_DB" "$DATA_DIR/stridecrew.db"
if [ -e "$ROLLBACK_DB-wal" ]; then
  sudo mv -- "$ROLLBACK_DB-wal" "$DATA_DIR/stridecrew.db-wal"
fi
if [ -e "$ROLLBACK_DB-shm" ]; then
  sudo mv -- "$ROLLBACK_DB-shm" "$DATA_DIR/stridecrew.db-shm"
fi
sudo chown 65532:65532 "$DATA_DIR/stridecrew.db" "$DATA_DIR"/stridecrew.db-* 2>/dev/null || true
docker compose --env-file .env -f compose.yaml up -d --wait --no-build api caddy
```

Recheck readiness, the private-route `401`, and an approved private read. Preserve the failed restored database and logs for investigation; do not retry blindly.

## 5. Close the recovery window

- Remove the age identity from `RESTORE_DIR` immediately after the drill or cutover. The long-term identity must remain with its custodian, off the VM.
- Keep the pre-restore database for the approved rollback period only. The recommended initial period is 24 hours after successful application verification.
- Reapply any verified deletion requests that occurred after the restored backup timestamp.
- Run `sudo ./scripts/production-check.sh .env --check-r2`.
- Record archive timestamp, application version, operators, start/end times, validation outcome, and whether rollback was used. Do not record PINs, QR URLs, session tokens, private keys, or child-level data.
