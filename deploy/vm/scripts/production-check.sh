#!/bin/sh

set -eu

SCRIPT_DIRECTORY=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
. "$SCRIPT_DIRECTORY/lib.sh"

[ "$(id -u)" -eq 0 ] || fail "run production-check.sh as root (for example with sudo)"
check_s3=false
if [ "${2:-}" = "--check-s3" ] || [ "${2:-}" = "--check-r2" ]; then
	check_s3=true
elif [ "$#" -gt 1 ]; then
	fail "usage: production-check.sh <env-file> [--check-s3]"
fi

for command_name in awk curl df docker find grep head sort stat swapon systemctl; do
	require_command "$command_name"
done
"$SCRIPT_DIRECTORY/preflight.sh" "$ENV_FILE"

site_address=$(require_env_value CADDY_SITE_ADDRESS)
data_directory=$(require_env_value DATA_DIR)
backup_directory=$(require_env_value BACKUP_DIR)

swap_kib=$(swapon --show=SIZE --bytes --noheadings | awk '{ total += $1 } END { printf "%.0f", total / 1024 }')
[ "${swap_kib:-0}" -ge 900000 ] || fail "at least 1 GiB of configured swap must be active"

for directory in "$data_directory" "$backup_directory"; do
	available_kib=$(df -Pk "$directory" | awk 'NR == 2 { print $4 }')
	[ "${available_kib:-0}" -ge 1048576 ] || fail "$directory has less than 1 GiB free"
done

running_services=$(compose ps --status running --services)
printf '%s\n' "$running_services" | grep -Fx api >/dev/null || fail "the API container is not running"
printf '%s\n' "$running_services" | grep -Fx caddy >/dev/null || fail "the Caddy container is not running"

curl --fail --silent --show-error "https://${site_address}/readyz" >/dev/null || fail "public readiness failed"
private_status=$(curl --silent --output /dev/null --write-out '%{http_code}' "https://${site_address}/v1/me/training-entries")
[ "$private_status" = "401" ] || fail "the unauthenticated private-route check returned HTTP $private_status, want 401"

systemctl is-enabled --quiet zoomigo-backup.timer || fail "the backup timer is not enabled"
systemctl is-active --quiet zoomigo-backup.timer || fail "the backup timer is not active"

newest_archive() {
	record=$(find "$backup_directory" -maxdepth 1 -type f -name "$1-*-v1.tar.gz.age" -printf '%T@ %f\n' | sort -nr | head -n 1)
	[ -n "$record" ] || fail "no encrypted local $1 archive exists"
	printf '%s' "${record#* }"
}

# The SQLite snapshot and the logical export are both required daily outputs.
latest_name=$(newest_archive zoomigo-backup)
latest_export=$(newest_archive zoomigo-export)
for archive_name in "$latest_name" "$latest_export"; do
	find "$backup_directory" -maxdepth 1 -type f -name "$archive_name" -mmin -1560 -print -quit | grep . >/dev/null || fail "$archive_name is more than 26 hours old"
done

if [ "$check_s3" = true ]; then
	require_command rclone
	s3_environment=/etc/zoomigo/backup-s3.env
	[ -f "$s3_environment" ] || fail "/etc/zoomigo/backup-s3.env is missing"
	permissions=$(stat -c '%a' "$s3_environment")
	case "$permissions" in 400|600) ;; *) fail "$s3_environment must have mode 0400 or 0600" ;; esac
	[ "$(stat -c '%u' "$s3_environment")" = "0" ] || fail "$s3_environment must be owned by root"
	# The file is root-owned operator configuration, not application input.
	. "$s3_environment"
	backup_s3_endpoint=${BACKUP_S3_ENDPOINT:-}
	backup_s3_bucket=${BACKUP_S3_BUCKET:-}
	backup_s3_access_key=${BACKUP_S3_ACCESS_KEY_ID:-}
	backup_s3_secret_key=${BACKUP_S3_SECRET_ACCESS_KEY:-}
	: "${backup_s3_endpoint:?BACKUP_S3_ENDPOINT is required}"
	: "${backup_s3_bucket:?BACKUP_S3_BUCKET is required}"
	: "${backup_s3_access_key:?BACKUP_S3_ACCESS_KEY_ID is required}"
	: "${backup_s3_secret_key:?BACKUP_S3_SECRET_ACCESS_KEY is required}"
	export RCLONE_CONFIG_ZOOMIGO_TYPE=s3
	export RCLONE_CONFIG_ZOOMIGO_PROVIDER="${BACKUP_S3_PROVIDER:-Other}"
	export RCLONE_CONFIG_ZOOMIGO_ACCESS_KEY_ID="$backup_s3_access_key"
	export RCLONE_CONFIG_ZOOMIGO_SECRET_ACCESS_KEY="$backup_s3_secret_key"
	export RCLONE_CONFIG_ZOOMIGO_ENDPOINT="$backup_s3_endpoint"
	export RCLONE_CONFIG_ZOOMIGO_REGION="${BACKUP_S3_REGION:-auto}"
	export RCLONE_CONFIG_ZOOMIGO_ACL=private
	for archive_name in "$latest_name" "$latest_export"; do
		rclone lsjson "zoomigo:${backup_s3_bucket}/daily/${archive_name}" --stat --files-only --s3-no-check-bucket >/dev/null || fail "$archive_name is missing from S3-compatible storage"
	done
fi

[ ! -f /var/run/reboot-required ] || fail "the VM requires a reboot for installed updates"

printf '%s\n' "Production readiness checks passed with encrypted backup $latest_name and export $latest_export."
