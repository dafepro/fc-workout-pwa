#!/bin/sh

set -eu

SCRIPT_DIRECTORY=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
. "$SCRIPT_DIRECTORY/lib.sh"

require_command docker
require_env_file
require_env_value DATA_DIR >/dev/null
require_env_value BACKUP_DIR >/dev/null
require_env_value RESTORE_DIR >/dev/null

[ "$#" -ge 2 ] || fail "usage: restore-drill.sh <env-file> <archive-filename>"
archive_name=$2
case "$archive_name" in
	*/*|*\\*|.|..) fail "archive must be a filename in BACKUP_DIR" ;;
	*.tar.gz) ;;
	*) fail "archive must end in .tar.gz" ;;
esac

target_name="restore-drill-$(date -u +%Y%m%dT%H%M%SZ).db"
archive_path="/backups/${archive_name}"
target_path="/restore/${target_name}"

compose run --rm backup verify --archive "$archive_path"
compose run --rm backup restore --archive "$archive_path" --target "$target_path"

printf '%s\n' "Restore drill passed and left the isolated database at RESTORE_DIR/$target_name."
printf '%s\n' "The live database was not stopped, replaced, or modified."
