#!/bin/sh

set -eu

SCRIPT_DIRECTORY=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
. "$SCRIPT_DIRECTORY/lib.sh"

require_command rclone
require_env_file
backup_directory=$(require_env_value BACKUP_DIR)

[ "$#" -ge 2 ] || fail "usage: upload-backup-s3.sh <env-file> <archive-filename>"
archive_name=$2
case "$archive_name" in
	*/*|*\\*|.|..) fail "archive must be a filename in BACKUP_DIR" ;;
	*.tar.gz.age) ;;
	*) fail "only age-encrypted backup archives may be uploaded" ;;
esac

require_process_value() {
	name=$1
	case "$name" in
		BACKUP_S3_ENDPOINT) value=${BACKUP_S3_ENDPOINT:-} ;;
		BACKUP_S3_BUCKET) value=${BACKUP_S3_BUCKET:-} ;;
		BACKUP_S3_ACCESS_KEY_ID) value=${BACKUP_S3_ACCESS_KEY_ID:-} ;;
		BACKUP_S3_SECRET_ACCESS_KEY) value=${BACKUP_S3_SECRET_ACCESS_KEY:-} ;;
		*) fail "unsupported process value: $name" ;;
	esac
	[ -n "$value" ] || fail "$name must be present in the backup service environment"
	printf '%s' "$value"
}

endpoint=$(require_process_value BACKUP_S3_ENDPOINT)
bucket=$(require_process_value BACKUP_S3_BUCKET)
access_key=$(require_process_value BACKUP_S3_ACCESS_KEY_ID)
secret_key=$(require_process_value BACKUP_S3_SECRET_ACCESS_KEY)
provider=${BACKUP_S3_PROVIDER:-Other}
region=${BACKUP_S3_REGION:-auto}

case "$endpoint" in https://*) ;; *) fail "BACKUP_S3_ENDPOINT must use HTTPS" ;; esac
case "$endpoint" in */) fail "BACKUP_S3_ENDPOINT must not have a trailing slash" ;; esac
case "$bucket" in ""|*[!A-Za-z0-9._-]*) fail "BACKUP_S3_BUCKET is invalid" ;; esac
case "$provider" in *[!A-Za-z0-9_-]*) fail "BACKUP_S3_PROVIDER is invalid" ;; esac
case "$region" in *[!A-Za-z0-9._-]*) fail "BACKUP_S3_REGION is invalid" ;; esac

local_path="${backup_directory}/${archive_name}"
[ -f "$local_path" ] || fail "encrypted backup does not exist: $local_path"

export RCLONE_CONFIG_ZOOMIGO_TYPE=s3
export RCLONE_CONFIG_ZOOMIGO_PROVIDER="$provider"
export RCLONE_CONFIG_ZOOMIGO_ACCESS_KEY_ID="$access_key"
export RCLONE_CONFIG_ZOOMIGO_SECRET_ACCESS_KEY="$secret_key"
export RCLONE_CONFIG_ZOOMIGO_ENDPOINT="$endpoint"
export RCLONE_CONFIG_ZOOMIGO_REGION="$region"
export RCLONE_CONFIG_ZOOMIGO_ACL=private

rclone copyto "$local_path" "zoomigo:${bucket}/daily/${archive_name}" \
	--s3-no-check-bucket \
	--no-traverse

printf '%s\n' "Uploaded encrypted backup to private S3-compatible storage as daily/$archive_name."
