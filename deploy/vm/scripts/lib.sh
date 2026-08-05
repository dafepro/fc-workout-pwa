#!/bin/sh

set -eu

SCRIPT_DIRECTORY=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
DEPLOY_DIRECTORY=$(CDPATH= cd -- "$SCRIPT_DIRECTORY/.." && pwd)
COMPOSE_FILE="$DEPLOY_DIRECTORY/compose.yaml"
ENV_FILE=${1:-"$DEPLOY_DIRECTORY/.env"}

fail() {
	printf '%s\n' "error: $*" >&2
	exit 1
}

require_command() {
	command -v "$1" >/dev/null 2>&1 || fail "$1 is required"
}

require_env_file() {
	[ -f "$ENV_FILE" ] || fail "environment file not found: $ENV_FILE"
}

env_value() {
	key=$1
	value=$(sed -n "s/^${key}=//p" "$ENV_FILE" | tail -n 1 | tr -d '\r')
	case "$value" in
		\"*\") value=${value#\"}; value=${value%\"} ;;
		\'*) value=${value#\'}; value=${value%\'} ;;
	esac
	printf '%s' "$value"
}

require_env_value() {
	value=$(env_value "$1")
	[ -n "$value" ] || fail "$1 must be set in $ENV_FILE"
	printf '%s' "$value"
}

validate_host_directory() {
	label=$1
	path=$2
	case "$path" in
		/*) ;;
		*) fail "$label must be an absolute path" ;;
	esac
	case "$path" in
		/|/bin|/boot|/dev|/etc|/home|/opt|/root|/srv|/tmp|/usr|/var|/var/backups|/var/lib)
			fail "$label is too broad: $path"
			;;
	esac
}

compose() {
	docker compose --env-file "$ENV_FILE" -f "$COMPOSE_FILE" "$@"
}
