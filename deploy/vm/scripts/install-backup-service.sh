#!/bin/sh

set -eu

SCRIPT_DIRECTORY=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
DEPLOY_DIRECTORY=$(CDPATH= cd -- "$SCRIPT_DIRECTORY/.." && pwd)
SERVICE_TEMPLATE="$DEPLOY_DIRECTORY/systemd/stridecrew-backup.service"
TIMER_TEMPLATE="$DEPLOY_DIRECTORY/systemd/stridecrew-backup.timer"

[ "$(id -u)" -eq 0 ] || {
	printf '%s\n' "error: run install-backup-service.sh as root (for example with sudo)" >&2
	exit 1
}
[ -f "$DEPLOY_DIRECTORY/.env" ] || {
	printf '%s\n' "error: $DEPLOY_DIRECTORY/.env is missing" >&2
	exit 1
}
case "$DEPLOY_DIRECTORY" in
	*[!A-Za-z0-9._/-]*)
		printf '%s\n' "error: the deployment checkout path contains unsupported characters" >&2
		exit 1
		;;
esac

temporary_service=$(mktemp)
trap 'rm -f -- "$temporary_service"' EXIT HUP INT TERM
escaped_directory=$(printf '%s' "$DEPLOY_DIRECTORY" | sed 's/[&|]/\\&/g')
sed "s|/opt/app/deploy/vm|$escaped_directory|g" "$SERVICE_TEMPLATE" >"$temporary_service"

install -m 0644 "$temporary_service" /etc/systemd/system/stridecrew-backup.service
install -m 0644 "$TIMER_TEMPLATE" /etc/systemd/system/stridecrew-backup.timer
systemctl daemon-reload

printf '%s\n' "Installed the ZoomiGo backup timer for checkout $DEPLOY_DIRECTORY."
