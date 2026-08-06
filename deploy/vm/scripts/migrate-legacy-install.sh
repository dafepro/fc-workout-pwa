#!/bin/sh

# This is the sole compatibility utility for the pre-ZoomiGo VM layout. Run it
# once before changing API_IMAGE to a native ZoomiGo image.
set -eu

SCRIPT_DIRECTORY=$(CDPATH='' cd -- "$(dirname -- "$0")" && pwd)
# Sibling library resolved from this script.
# shellcheck disable=SC1091
. "$SCRIPT_DIRECTORY/lib.sh"

[ "$(id -u)" -eq 0 ] || fail "run migrate-legacy-install.sh as root"
for command_name in chmod date docker grep install mktemp sed sha256sum systemctl; do
	require_command "$command_name"
done
require_env_file

legacy_data_directory=$(require_env_value DATA_DIR)
legacy_backup_directory=$(require_env_value BACKUP_DIR)
legacy_restore_directory=$(require_env_value RESTORE_DIR)
legacy_admin_directory=$(require_env_value ADMIN_OUTPUT_DIR)
legacy_image=$(require_env_value API_IMAGE)
backup_recipient=$(require_env_value BACKUP_AGE_RECIPIENT)
application_version=$(require_env_value APP_VERSION)

[ "$legacy_data_directory" = "/var/lib/stridecrew/data" ] || fail "DATA_DIR is not the expected legacy path"
[ "$legacy_backup_directory" = "/var/backups/stridecrew" ] || fail "BACKUP_DIR is not the expected legacy path"
[ "$legacy_restore_directory" = "/var/lib/stridecrew/restore" ] || fail "RESTORE_DIR is not the expected legacy path"
[ "$legacy_admin_directory" = "/var/lib/stridecrew/admin-output" ] || fail "ADMIN_OUTPUT_DIR is not the expected legacy path"

legacy_database="$legacy_data_directory/stridecrew.db"
new_root=/var/lib/zoomigo
new_data_directory=$new_root/data
new_backup_directory=/var/backups/zoomigo
new_restore_directory=$new_root/restore
new_admin_directory=$new_root/admin-output
new_database="$new_data_directory/zoomigo.db"
marker="$new_root/ZOOMIGO_MIGRATION_COMPLETE"

if [ -f "$marker" ]; then
	[ -f "$new_database" ] || fail "migration marker exists but the ZoomiGo database is missing"
	printf '%s\n' "ZoomiGo host state was already migrated; legacy state remains available for rollback."
	exit 0
fi
[ -f "$legacy_database" ] || fail "legacy database is missing: $legacy_database"
[ ! -e "$new_database" ] || fail "new database already exists; refusing ambiguous migration state"
[ ! -e "$new_data_directory" ] || fail "new data directory already exists without a migration marker"

COMPOSE_PROJECT_NAME=stridecrew docker compose --env-file "$ENV_FILE" -f "$COMPOSE_FILE" down

archive_name="stridecrew-pre-zoomigo-$(date -u +%Y%m%dT%H%M%SZ)-v1.tar.gz.age"
docker run --rm \
	--user 65532:65532 \
	--entrypoint /stridecrew-backup \
	--volume "$legacy_data_directory:/data:ro" \
	--volume "$legacy_backup_directory:/backups" \
	"$legacy_image" create-encrypted \
	--database-url file:/data/stridecrew.db \
	--output "/backups/$archive_name" \
	--recipient "$backup_recipient" \
	--app-version "$application_version"

archive_path="$legacy_backup_directory/$archive_name"
[ -s "$archive_path" ] || fail "pre-migration encrypted backup was not created"
archive_checksum=$(sha256sum "$archive_path" | sed 's/[[:space:]].*$//')

install -d -m 0700 -o 65532 -g 65532 \
	"$new_data_directory" "$new_backup_directory" "$new_restore_directory" "$new_admin_directory"
install -m 0600 -o 65532 -g 65532 "$legacy_database" "$new_database"
for suffix in -wal -shm; do
	if [ -f "$legacy_database$suffix" ]; then
		install -m 0600 -o 65532 -g 65532 "$legacy_database$suffix" "$new_database$suffix"
	fi
done

temporary_environment=$(mktemp)
trap 'rm -f -- "$temporary_environment"' EXIT HUP INT TERM
sed \
	-e 's|^COMPOSE_PROJECT_NAME=.*$|COMPOSE_PROJECT_NAME=zoomigo|' \
	-e 's|^DATA_DIR=.*$|DATA_DIR=/var/lib/zoomigo/data|' \
	-e 's|^BACKUP_DIR=.*$|BACKUP_DIR=/var/backups/zoomigo|' \
	-e 's|^RESTORE_DIR=.*$|RESTORE_DIR=/var/lib/zoomigo/restore|' \
	-e 's|^ADMIN_OUTPUT_DIR=.*$|ADMIN_OUTPUT_DIR=/var/lib/zoomigo/admin-output|' \
	"$ENV_FILE" >"$temporary_environment"
grep -Fx 'COMPOSE_PROJECT_NAME=zoomigo' "$temporary_environment" >/dev/null || fail "could not render the ZoomiGo environment"

[ ! -e "$ENV_FILE.pre-zoomigo" ] || fail "$ENV_FILE.pre-zoomigo already exists"
install -m 0600 "$ENV_FILE" "$ENV_FILE.pre-zoomigo"
install -m 0600 "$temporary_environment" "$ENV_FILE"

{
	printf '%s\n' "legacy_backup=$archive_path"
	printf '%s\n' "legacy_backup_sha256=$archive_checksum"
	printf '%s\n' "legacy_database=$legacy_database"
	printf '%s\n' "zoomigo_database=$new_database"
} >"$marker"
chmod 0600 "$marker"

systemctl disable --now stridecrew-backup.timer >/dev/null 2>&1 || true
printf '%s\n' "Host state copied to native ZoomiGo paths."
printf '%s\n' "Update API_IMAGE and APP_VERSION to the reviewed ZoomiGo release, deploy, verify, then install zoomigo-backup.timer."
printf '%s\n' "The legacy database and encrypted pre-migration backup were preserved."
