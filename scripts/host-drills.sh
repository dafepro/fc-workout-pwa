#!/bin/sh

# The read-only half of roadmap step 5 that only the live VM can answer. Runs on
# the production host, either directly from the checkout or piped in over SSH:
#
#   ssh zoomigo@HOST sh -s -- /opt/app/deploy/vm <scripts/host-drills.sh
#
# It only inspects. It never writes to the database, uploads anything, decrypts
# an archive, or restarts a container, and it deliberately has no access to the
# age identity, so it cannot restore even by accident.

set -eu

VM_DIRECTORY=${1:-/opt/app/deploy/vm}
ENV_FILE="$VM_DIRECTORY/.env"
BACKUP_DIRECTORY_DEFAULT=/var/lib/zoomigo/backups

fail() {
	printf '%s\n' "error: $*" >&2
	exit 1
}

[ -f "$ENV_FILE" ] || fail "environment file not found: $ENV_FILE"
cd "$VM_DIRECTORY"

env_value() {
	sed -n "s/^$1=//p" "$ENV_FILE" | tail -n 1 | tr -d '\r'
}

compose() {
	docker compose --env-file "$ENV_FILE" -f compose.yaml "$@"
}

# Readiness, swap, free space, running containers, the private-route 401, the
# backup timer, both archives fresh locally, and both present in the bucket.
sudo -n ./scripts/production-check.sh .env --check-s3

# Bounded logging is what keeps a 512 MiB Droplet from filling its disk with
# journal. compose.yaml declaring it is not proof Docker applied it.
for service in api caddy; do
	container=$(compose ps --quiet "$service")
	[ -n "$container" ] || fail "the $service container is not running"
	applied=$(docker inspect --format '{{.HostConfig.LogConfig.Type}} {{index .HostConfig.LogConfig.Config "max-size"}} {{index .HostConfig.LogConfig.Config "max-file"}}' "$container")
	printf '%s\n' "Bounded logs: $service runs with $applied."
	[ "$applied" = "local 5m 3" ] || fail "the running $service container logs with '$applied', want 'local 5m 3'"
done

# Retention only prunes after a successful upload, so anything still here past
# the horizon means uploads have been failing quietly.
retention_days=$(env_value LOCAL_BACKUP_RETENTION_DAYS)
backup_directory=$(env_value BACKUP_DIR)
[ -n "$backup_directory" ] || backup_directory=$BACKUP_DIRECTORY_DEFAULT
case "$retention_days" in
	*[!0-9]*|"") fail "LOCAL_BACKUP_RETENTION_DAYS is not an integer in $ENV_FILE" ;;
esac
stale=$(sudo -n find "$backup_directory" -maxdepth 1 -type f \
	-name 'zoomigo-*-v1.tar.gz.age' -mtime "+$retention_days" | wc -l | tr -d ' ')
printf '%s\n' "Retention: $stale local archives are older than $retention_days days."
[ "$stale" -eq 0 ] || fail "$stale local archives outlived the retention horizon; uploads are probably failing"

printf '%s\n' "Live-host production drills passed."
