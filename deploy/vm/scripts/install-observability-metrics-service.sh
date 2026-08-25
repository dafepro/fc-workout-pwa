#!/bin/sh

set -eu

SCRIPT_DIRECTORY=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
. "$SCRIPT_DIRECTORY/lib.sh"

require_env_file
[ "$(id -u)" -eq 0 ] || fail "run install-observability-metrics-service.sh as root"

service_name=zoomigo-observability-host-metrics.service
timer_name=zoomigo-observability-host-metrics.timer
if [ "$(env_value ENABLE_OBSERVABILITY)" != true ]; then
	if [ ! -e "/etc/systemd/system/$service_name" ] && [ ! -e "/etc/systemd/system/$timer_name" ]; then
		exit 0
	fi
	require_command systemctl
	systemctl disable --now "$timer_name" >/dev/null 2>&1 || true
	rm -f -- "/etc/systemd/system/$service_name" "/etc/systemd/system/$timer_name"
	systemctl daemon-reload
	exit 0
fi

require_command systemctl
sh "$SCRIPT_DIRECTORY/observability-preflight.sh" "$ENV_FILE"
install -m 0644 "$DEPLOY_DIRECTORY/systemd/$service_name" "/etc/systemd/system/$service_name"
install -m 0644 "$DEPLOY_DIRECTORY/systemd/$timer_name" "/etc/systemd/system/$timer_name"
systemctl daemon-reload
systemctl enable --now "$timer_name"
