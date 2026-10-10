#!/bin/sh

set -eu

SCRIPT_DIRECTORY=$(CDPATH='' cd -- "$(dirname -- "$0")" && pwd)
REPOSITORY_ROOT=$(CDPATH='' cd -- "$SCRIPT_DIRECTORY/.." && pwd)
COMPOSE_FILE="$REPOSITORY_ROOT/backend/compose.e2e.yaml"
RUN_WORLD=false
case ${1:-} in
	"") ;;
	--world) RUN_WORLD=true ;;
	*) printf '%s\n' "usage: ./scripts/e2e.sh [--world]" >&2; exit 1 ;;
esac

command -v docker >/dev/null 2>&1 || {
	printf '%s\n' "error: Docker is required" >&2
	exit 1
}

compose() {
	if [ "$RUN_WORLD" = true ]; then
		docker compose -f "$COMPOSE_FILE" -f "$REPOSITORY_ROOT/backend/compose.world-e2e.yaml" "$@"
	else
		docker compose -f "$COMPOSE_FILE" "$@"
	fi
}
report=$(mktemp)
cleanup() {
	compose down --volumes --remove-orphans >/dev/null 2>&1 || true
	rm -f "$report"
}
trap cleanup EXIT HUP INT TERM

if [ "$RUN_WORLD" = true ]; then
	compose build api pwa team-world browser-e2e
	compose up -d --wait --wait-timeout 180 --no-build api pwa team-world
	if ! compose run --rm browser-e2e >"$report"; then
		cat "$report" >&2
		exit 1
	fi
	node "$SCRIPT_DIRECTORY/verify-browser-report.mjs" "$report"
else
	compose build api pwa e2e browser-e2e
	compose up -d --wait --wait-timeout 180 --no-build api pwa
	compose run --rm e2e
	compose run --rm browser-e2e
fi

printf '%s\n' "ZoomiGo API and browser Docker E2E suites passed."
