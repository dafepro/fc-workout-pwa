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
	*.tar.gz.age) ;;
	*) fail "archive must end in .tar.gz.age" ;;
esac
case "$identity_name" in
	*/*|*\\*|.|..) fail "identity must be a filename in RESTORE_DIR" ;;
	*) ;;
esac

target_name="restore-drill-$(date -u +%Y%m%dT%H%M%SZ).db"
archive_path="/backups/${archive_name}"
target_path="/restore/${target_name}"
identity_path="/restore/${identity_name}"

compose run --rm backup verify-encrypted --archive "$archive_path" --identity "$identity_path"
compose run --rm backup restore-encrypted --archive "$archive_path" --identity "$identity_path" --target "$target_path"

printf '%s\n' "Restore drill passed and left the isolated database at RESTORE_DIR/$target_name."
printf '%s\n' "The live database was not stopped, replaced, or modified."
printf '%s\n' "Remove the temporarily supplied identity from RESTORE_DIR immediately."
