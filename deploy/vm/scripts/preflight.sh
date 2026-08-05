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
data_directory=$(require_env_value DATA_DIR)
backup_directory=$(require_env_value BACKUP_DIR)
restore_directory=$(require_env_value RESTORE_DIR)

case "$site_address" in
	http://*|https://*|*/*|localhost|*:* ) fail "CADDY_SITE_ADDRESS must be a bare public DNS hostname" ;;
esac
printf '%s' "$site_address" | grep -Eq '^[A-Za-z0-9]([A-Za-z0-9.-]*[A-Za-z0-9])?$' || fail "CADDY_SITE_ADDRESS is not a valid hostname"

case "$pwa_origin" in
	https://*/*) fail "PWA_ORIGIN must not include a path or trailing slash" ;;
	https://*) ;;
	*) fail "PWA_ORIGIN must be an https origin" ;;
esac

validate_host_directory DATA_DIR "$data_directory"
validate_host_directory BACKUP_DIR "$backup_directory"
validate_host_directory RESTORE_DIR "$restore_directory"

for directory in "$data_directory" "$backup_directory" "$restore_directory"; do
	[ -d "$directory" ] || fail "host directory does not exist; run prepare-host.sh first: $directory"
done

compose config --quiet
printf '%s\n' "VM deployment preflight passed."
