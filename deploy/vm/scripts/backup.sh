#!/bin/sh

set -eu

SCRIPT_DIRECTORY=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
. "$SCRIPT_DIRECTORY/lib.sh"

require_command docker
require_command find
require_env_file
require_env_value DATA_DIR >/dev/null
require_env_value BACKUP_DIR >/dev/null
require_env_value RESTORE_DIR >/dev/null
application_version=$(require_env_value APP_VERSION)
backup_recipient=$(require_env_value BACKUP_AGE_RECIPIENT)
backup_directory=$(require_env_value BACKUP_DIR)
retention_days=$(require_env_value LOCAL_BACKUP_RETENTION_DAYS)
validate_host_directory BACKUP_DIR "$backup_directory"
case "$retention_days" in
	*[!0-9]*|"") fail "LOCAL_BACKUP_RETENTION_DAYS must be an integer from 1 through 90" ;;
esac
[ "$retention_days" -ge 1 ] && [ "$retention_days" -le 90 ] || fail "LOCAL_BACKUP_RETENTION_DAYS must be an integer from 1 through 90"

archive_name="stridecrew-backup-$(date -u +%Y%m%dT%H%M%SZ)-v1.tar.gz.age"
archive_path="/backups/${archive_name}"

compose run --rm backup create-encrypted \
	--database-url file:/data/stridecrew.db \
	--output "$archive_path" \
	--recipient "$backup_recipient" \
	--app-version "$application_version"

printf '%s\n' "Created, verified, and age-encrypted $archive_name."

upload_enabled=$(env_value R2_UPLOAD_ENABLED)
case "$upload_enabled" in
	true)
		"$SCRIPT_DIRECTORY/upload-backup-r2.sh" "$ENV_FILE" "$archive_name"
		find "$backup_directory" -maxdepth 1 -type f -name 'stridecrew-backup-*-v1.tar.gz.age' -mtime "+$retention_days" -delete
		printf '%s\n' "Pruned local encrypted backups older than $retention_days days after the successful R2 upload."
		;;
	false|"") printf '%s\n' "Warning: R2 upload is disabled; this backup remains on one host." ;;
	*) fail "R2_UPLOAD_ENABLED must be true or false" ;;
esac
