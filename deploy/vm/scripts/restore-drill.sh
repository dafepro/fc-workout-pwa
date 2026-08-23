#!/bin/sh

set -eu

SCRIPT_DIRECTORY=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
. "$SCRIPT_DIRECTORY/lib.sh"

require_command docker
require_env_file
require_env_value DATA_DIR >/dev/null
require_env_value BACKUP_DIR >/dev/null
require_env_value RESTORE_DIR >/dev/null

[ "$#" -ge 3 ] || fail "usage: restore-drill.sh <env-file> <archive-filename> <identity-filename-in-RESTORE_DIR>"
archive_name=$2
identity_name=$3
case "$archive_name" in
	*/*|*\\*|.|..) fail "archive must be a filename in BACKUP_DIR" ;;
	zoomigo-backup-*.tar.gz.age) verify_command=verify-encrypted; load_command=restore-encrypted ;;
	zoomigo-export-*.tar.gz.age) verify_command=verify-export-encrypted; load_command=import-encrypted ;;
	*) fail "archive must be a zoomigo-backup-*.tar.gz.age snapshot or a zoomigo-export-*.tar.gz.age logical export" ;;
esac
case "$identity_name" in
	*/*|*\\*|.|..) fail "identity must be a filename in RESTORE_DIR" ;;
	*) ;;
esac

target_name="restore-drill-$(date -u +%Y%m%dT%H%M%SZ).db"
archive_path="/backups/${archive_name}"
target_path="/restore/${target_name}"
identity_path="/restore/${identity_name}"

compose run --rm backup "$verify_command" --archive "$archive_path" --identity "$identity_path"
compose run --rm backup "$load_command" --archive "$archive_path" --identity "$identity_path" --target "$target_path"
record_observability_gauge zoomigo_restore_drill_last_success \
	"Whether the most recent restore drill succeeded." 1
record_observability_gauge zoomigo_restore_drill_last_success_timestamp_seconds \
	"Unix timestamp of the most recent successful restore drill." "$(date -u +%s)"

printf '%s\n' "Restore drill passed and left the isolated database at RESTORE_DIR/$target_name."
printf '%s\n' "The live database was not stopped, replaced, or modified."
printf '%s\n' "Remove the temporarily supplied identity from RESTORE_DIR immediately."
