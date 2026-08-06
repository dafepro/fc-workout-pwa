#!/bin/sh

set -eu

SCRIPT_DIRECTORY=$(CDPATH='' cd -- "$(dirname -- "$0")" && pwd)
REPOSITORY_ROOT=$(CDPATH='' cd -- "$SCRIPT_DIRECTORY/.." && pwd)
COMPOSE_FILE="$REPOSITORY_ROOT/backend/compose.e2e.yaml"

command -v docker >/dev/null 2>&1 || {
	printf '%s\n' "error: Docker is required" >&2
	exit 1
}

cleanup() {
	docker compose -f "$COMPOSE_FILE" down --volumes --remove-orphans >/dev/null 2>&1 || true
}
trap cleanup EXIT HUP INT TERM

docker compose -f "$COMPOSE_FILE" build api pwa e2e browser-e2e
docker compose -f "$COMPOSE_FILE" up -d --wait --no-build api pwa
docker compose -f "$COMPOSE_FILE" run --rm e2e
docker compose -f "$COMPOSE_FILE" run --rm browser-e2e

printf '%s\n' "ZoomiGo API and browser Docker E2E suites passed."
