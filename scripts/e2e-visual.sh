#!/bin/sh

set -eu

SCRIPT_DIRECTORY=$(CDPATH='' cd -- "$(dirname -- "$0")" && pwd)
REPOSITORY_ROOT=$(CDPATH='' cd -- "$SCRIPT_DIRECTORY/.." && pwd)
COMPOSE_FILE="$REPOSITORY_ROOT/backend/compose.e2e.yaml"
VISUAL_SPEC="e2e/pwa-team-lounge.visual.spec.ts"

command -v docker >/dev/null 2>&1 || {
	printf '%s\n' "error: Docker is required" >&2
	exit 1
}

cleanup() {
	docker compose -f "$COMPOSE_FILE" down --volumes --remove-orphans >/dev/null 2>&1 || true
}
trap cleanup EXIT HUP INT TERM

docker compose -f "$COMPOSE_FILE" build api pwa browser-e2e
docker compose -f "$COMPOSE_FILE" up -d --wait --no-build api pwa

case "${1:-}" in
"")
	docker compose -f "$COMPOSE_FILE" run --rm browser-e2e \
		pnpm exec playwright test "$VISUAL_SPEC"
	;;
--update-snapshots)
	docker compose -f "$COMPOSE_FILE" run --rm \
		--volume "$REPOSITORY_ROOT/e2e:/app/e2e" \
		browser-e2e pnpm exec playwright test "$VISUAL_SPEC" --update-snapshots
	;;
*)
	printf '%s\n' "usage: $0 [--update-snapshots]" >&2
	exit 2
	;;
esac

printf '%s\n' "ZoomiGo Team Lounge visual regression suite passed."
