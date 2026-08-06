#!/bin/sh

set -eu

SCRIPT_DIRECTORY=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
. "$SCRIPT_DIRECTORY/lib.sh"

require_command rclone
require_env_file
backup_directory=$(require_env_value BACKUP_DIR)

[ "$#" -ge 2 ] || fail "usage: upload-backup-r2.sh <env-file> <archive-filename>"
archive_name=$2
case "$archive_name" in
	*/*|*\\*|.|..) fail "archive must be a filename in BACKUP_DIR" ;;
	*.tar.gz.age) ;;
	*) fail "only age-encrypted backup archives may be uploaded" ;;
esac

require_process_value() {
	name=$1
	case "$name" in
		R2_ACCOUNT_ID) value=${R2_ACCOUNT_ID:-} ;;
		R2_BUCKET) value=${R2_BUCKET:-} ;;
		R2_ACCESS_KEY_ID) value=${R2_ACCESS_KEY_ID:-} ;;
		R2_SECRET_ACCESS_KEY) value=${R2_SECRET_ACCESS_KEY:-} ;;
		*) fail "unsupported process value: $name" ;;
	esac
	[ -n "$value" ] || fail "$name must be present in the backup service environment"
	printf '%s' "$value"
}

account_id=$(require_process_value R2_ACCOUNT_ID)
bucket=$(require_process_value R2_BUCKET)
access_key=$(require_process_value R2_ACCESS_KEY_ID)
secret_key=$(require_process_value R2_SECRET_ACCESS_KEY)

case "$account_id" in *[!A-Za-z0-9]*) fail "R2_ACCOUNT_ID is invalid" ;; esac
case "$bucket" in ""|*[!a-z0-9.-]*) fail "R2_BUCKET is invalid" ;; esac

local_path="${backup_directory}/${archive_name}"
[ -f "$local_path" ] || fail "encrypted backup does not exist: $local_path"

export RCLONE_CONFIG_STRIDECREW_TYPE=s3
export RCLONE_CONFIG_STRIDECREW_PROVIDER=Cloudflare
export RCLONE_CONFIG_STRIDECREW_ACCESS_KEY_ID="$access_key"
export RCLONE_CONFIG_STRIDECREW_SECRET_ACCESS_KEY="$secret_key"
export RCLONE_CONFIG_STRIDECREW_ENDPOINT="https://${account_id}.r2.cloudflarestorage.com"
export RCLONE_CONFIG_STRIDECREW_ACL=private

rclone copyto "$local_path" "stridecrew:${bucket}/daily/${archive_name}" \
	--s3-no-check-bucket \
	--no-traverse

printf '%s\n' "Uploaded encrypted backup to the private R2 bucket as daily/$archive_name."
