#!/bin/sh

set -eu

SCRIPT_DIRECTORY=$(CDPATH='' cd -- "$(dirname -- "$0")" && pwd)
REPOSITORY_ROOT=$(CDPATH='' cd -- "$SCRIPT_DIRECTORY/.." && pwd)
COMPOSE_FILE="$REPOSITORY_ROOT/deploy/vm/compose.yaml"
WORK_ROOT="$REPOSITORY_ROOT/work"

for command_name in curl docker grep mktemp node; do
	command -v "$command_name" >/dev/null 2>&1 || {
		printf '%s\n' "error: $command_name is required" >&2
		exit 1
	}
done

mkdir -p "$WORK_ROOT"
SMOKE_ROOT=$(mktemp -d "$WORK_ROOT/vm-smoke.XXXXXX")
ENV_FILE="$SMOKE_ROOT/smoke.env"
DATA_DIRECTORY="$SMOKE_ROOT/data"
BACKUP_DIRECTORY="$SMOKE_ROOT/backups"
RESTORE_DIRECTORY="$SMOKE_ROOT/restore"
ADMIN_OUTPUT_DIRECTORY="$SMOKE_ROOT/admin-output"

compose() {
	docker compose --env-file "$ENV_FILE" -f "$COMPOSE_FILE" "$@"
}

cleanup() {
	if [ -f "$ENV_FILE" ]; then
		compose down --volumes --remove-orphans >/dev/null 2>&1 || true
	fi
	case "$SMOKE_ROOT" in
		"$WORK_ROOT"/vm-smoke.*) rm -rf -- "$SMOKE_ROOT" ;;
		*) printf '%s\n' "warning: refused to remove unexpected smoke directory $SMOKE_ROOT" >&2 ;;
	esac
}
trap cleanup EXIT HUP INT TERM

free_port() {
	node -e 'const server=require("node:net").createServer();server.listen(0,"127.0.0.1",()=>{console.log(server.address().port);server.close()})'
}

wait_for_status() {
	uri=$1
	expected=$2
	attempt=1
	while [ "$attempt" -le 30 ]; do
		if response=$(curl --fail --silent --show-error --max-time 2 "$uri" 2>/dev/null) &&
			printf '%s' "$response" | grep -Eq '"status"[[:space:]]*:[[:space:]]*"'"$expected"'"'; then
			return 0
		fi
		attempt=$((attempt + 1))
		sleep 1
	done
	printf '%s\n' "error: $uri did not report status $expected" >&2
	return 1
}

HTTP_PORT=$(free_port)
HTTPS_PORT=$(free_port)
[ "$HTTP_PORT" != "$HTTPS_PORT" ] || HTTPS_PORT=$(free_port)

mkdir -p "$DATA_DIRECTORY" "$BACKUP_DIRECTORY" "$RESTORE_DIRECTORY" "$ADMIN_OUTPUT_DIRECTORY"
chmod 0777 "$DATA_DIRECTORY" "$BACKUP_DIRECTORY" "$RESTORE_DIRECTORY" "$ADMIN_OUTPUT_DIRECTORY"

cat >"$ENV_FILE" <<EOF
COMPOSE_PROJECT_NAME=zoomigo-vm-smoke
API_IMAGE=zoomigo-api:vm-smoke
APP_VERSION=vm-smoke
BACKUP_AGE_RECIPIENT=age1vm_smoke_public_recipient
BACKUP_S3_UPLOAD_ENABLED=false
LOCAL_BACKUP_RETENTION_DAYS=7
PRODUCTION_DATA_APPROVED=false
CADDY_SITE_ADDRESS=http://127.0.0.1
PWA_ORIGIN=http://localhost:3000
TEAM_TIME_ZONE=America/Chicago
DATA_DIR=$DATA_DIRECTORY
BACKUP_DIR=$BACKUP_DIRECTORY
RESTORE_DIR=$RESTORE_DIRECTORY
ADMIN_OUTPUT_DIR=$ADMIN_OUTPUT_DIRECTORY
HTTP_BIND_ADDRESS=127.0.0.1
HTTP_PORT=$HTTP_PORT
HTTPS_BIND_ADDRESS=127.0.0.1
HTTPS_PORT=$HTTPS_PORT
EOF

compose config --quiet
compose build api backup
if ! compose up -d --wait --no-build api caddy; then
	compose ps --all || true
	compose logs --no-color --tail 100 api caddy || true
	exit 1
fi

wait_for_status "http://127.0.0.1:$HTTP_PORT/healthz" ok
wait_for_status "http://127.0.0.1:$HTTP_PORT/readyz" ready

private_status=$(curl --silent --output /dev/null --write-out '%{http_code}' --max-time 3 \
	"http://127.0.0.1:$HTTP_PORT/v1/me/training-entries")
[ "$private_status" = "401" ] || {
	printf '%s\n' "error: private route returned HTTP $private_status, want 401" >&2
	exit 1
}

DATABASE_PATH="$DATA_DIRECTORY/zoomigo.db"
[ -s "$DATABASE_PATH" ] || {
	printf '%s\n' "error: API did not create the persistent SQLite database" >&2
	exit 1
}

if ! compose restart api; then
	compose ps --all || true
	compose logs --no-color --tail 100 api caddy || true
	exit 1
fi
wait_for_status "http://127.0.0.1:$HTTP_PORT/readyz" ready
[ -s "$DATABASE_PATH" ] || {
	printf '%s\n' "error: SQLite database did not survive restart" >&2
	exit 1
}

compose run --rm backup create --database-url file:/data/zoomigo.db --output /backups/smoke.tar.gz --app-version vm-smoke
compose run --rm backup verify --archive /backups/smoke.tar.gz
compose run --rm backup restore --archive /backups/smoke.tar.gz --target /restore/smoke.db

for artifact in "$BACKUP_DIRECTORY/smoke.tar.gz" "$RESTORE_DIRECTORY/smoke.db"; do
	[ -s "$artifact" ] || {
		printf '%s\n' "error: expected deployment artifact was not created: $artifact" >&2
		exit 1
	}
done

printf '%s\n' "VM deployment smoke test passed."
