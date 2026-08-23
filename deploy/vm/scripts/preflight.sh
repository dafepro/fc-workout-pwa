#!/bin/sh

set -eu

SCRIPT_DIRECTORY=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
. "$SCRIPT_DIRECTORY/lib.sh"

require_command docker
require_env_file
docker info >/dev/null 2>&1 || fail "the Docker daemon is not available"
docker compose version >/dev/null 2>&1 || fail "Docker Compose v2 is required"

site_address=$(require_env_value CADDY_SITE_ADDRESS)
pwa_origin=$(require_env_value PWA_ORIGIN)
api_image=$(require_env_value API_IMAGE)
backup_recipient=$(require_env_value BACKUP_AGE_RECIPIENT)
local_retention_days=$(require_env_value LOCAL_BACKUP_RETENTION_DAYS)
production_data_approved=$(require_env_value PRODUCTION_DATA_APPROVED)
data_directory=$(require_env_value DATA_DIR)
backup_directory=$(require_env_value BACKUP_DIR)
restore_directory=$(require_env_value RESTORE_DIR)
admin_output_directory=$(require_env_value ADMIN_OUTPUT_DIR)
enable_observability=$(env_value ENABLE_OBSERVABILITY)

case "$site_address" in
	http://*|https://*|*/*|localhost|*:* ) fail "CADDY_SITE_ADDRESS must be a bare public DNS hostname" ;;
esac
printf '%s' "$site_address" | grep -Eq '^[A-Za-z0-9]([A-Za-z0-9.-]*[A-Za-z0-9])?$' || fail "CADDY_SITE_ADDRESS is not a valid hostname"

case "$api_image" in
	*:latest|*:main) fail "API_IMAGE must use an immutable sha-* tag, not a moving tag" ;;
	*:sha-*|zoomigo-api:*) ;;
	*) fail "API_IMAGE must use an immutable sha-* tag (or zoomigo-api:* for a local source build)" ;;
esac

case "$backup_recipient" in
	age1*) ;;
	*) fail "BACKUP_AGE_RECIPIENT must be an age X25519 public recipient" ;;
esac

case "$local_retention_days" in
	*[!0-9]*|"") fail "LOCAL_BACKUP_RETENTION_DAYS must be an integer from 1 through 90" ;;
esac
[ "$local_retention_days" -ge 1 ] && [ "$local_retention_days" -le 90 ] || fail "LOCAL_BACKUP_RETENTION_DAYS must be an integer from 1 through 90"

case "$production_data_approved" in
	true|false) ;;
	*) fail "PRODUCTION_DATA_APPROVED must be true or false" ;;
esac
case "$enable_observability" in
	true|false|"") ;;
	*) fail "ENABLE_OBSERVABILITY must be true or false" ;;
esac

# Empty is allowed and means the console is off; a wrong value is not, because
# it would fail at staff sign-in rather than here.
staff_secret_key=$(env_value STAFF_SECRET_KEY)
if [ -n "$staff_secret_key" ]; then
	printf '%s' "$staff_secret_key" | grep -Eq '^[A-Za-z0-9+/]{43}=$' || fail "STAFF_SECRET_KEY must be 32 base64-encoded bytes"
fi
for console_url_name in PLAYER_LOGIN_URL STAFF_SETUP_URL; do
	console_url=$(env_value "$console_url_name")
	case "$console_url" in
		"") ;;
		https://*) ;;
		*) fail "$console_url_name must be an absolute https URL" ;;
	esac
done

case "$pwa_origin" in
	https://*/*) fail "PWA_ORIGIN must not include a path or trailing slash" ;;
	https://*) ;;
	*) fail "PWA_ORIGIN must be an https origin" ;;
esac

validate_host_directory DATA_DIR "$data_directory"
validate_host_directory BACKUP_DIR "$backup_directory"
validate_host_directory RESTORE_DIR "$restore_directory"
validate_host_directory ADMIN_OUTPUT_DIR "$admin_output_directory"

for directory in "$data_directory" "$backup_directory" "$restore_directory" "$admin_output_directory"; do
	[ -d "$directory" ] || fail "host directory does not exist; run prepare-host.sh first: $directory"
done

compose config --quiet
sh "$SCRIPT_DIRECTORY/observability-preflight.sh" "$ENV_FILE"
printf '%s\n' "VM deployment preflight passed."
