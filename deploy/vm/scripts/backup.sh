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

timestamp=$(date -u +%Y%m%dT%H%M%SZ)
archive_name="zoomigo-backup-${timestamp}-v1.tar.gz.age"
export_name="zoomigo-export-${timestamp}-v1.tar.gz.age"

# The SQLite snapshot is the fast same-engine recovery path; the logical export
# is the one that survives a schema or engine change.
compose run --rm backup create-encrypted \
	--database-url file:/data/zoomigo.db \
	--media-dir /data/reward-media \
	--output "/backups/${archive_name}" \
	--recipient "$backup_recipient" \
	--app-version "$application_version"

compose run --rm backup export-encrypted \
	--database-url file:/data/zoomigo.db \
	--media-dir /data/reward-media \
	--output "/backups/${export_name}" \
	--recipient "$backup_recipient" \
	--app-version "$application_version"

printf '%s\n' "Created, verified, and age-encrypted $archive_name and $export_name."

upload_enabled=$(env_value BACKUP_S3_UPLOAD_ENABLED)
case "$upload_enabled" in
	true)
		"$SCRIPT_DIRECTORY/upload-backup-s3.sh" "$ENV_FILE" "$archive_name"
		"$SCRIPT_DIRECTORY/upload-backup-s3.sh" "$ENV_FILE" "$export_name"
		find "$backup_directory" -maxdepth 1 -type f \
			\( -name 'zoomigo-backup-*-v1.tar.gz.age' -o -name 'zoomigo-export-*-v1.tar.gz.age' \) \
			-mtime "+$retention_days" -delete
		printf '%s\n' "Pruned local encrypted backups older than $retention_days days after the successful S3 upload."
		;;
	false|"") printf '%s\n' "Warning: S3 upload is disabled; this backup remains on one host." ;;
	*) fail "BACKUP_S3_UPLOAD_ENABLED must be true or false" ;;
esac
