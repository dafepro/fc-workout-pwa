#!/bin/sh

set -eu

SCRIPT_DIRECTORY=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
. "$SCRIPT_DIRECTORY/lib.sh"

"$SCRIPT_DIRECTORY/preflight.sh" "$ENV_FILE"
site_address=$(require_env_value CADDY_SITE_ADDRESS)

compose pull caddy
compose build api
compose run --rm --no-deps caddy caddy validate --config /etc/caddy/Caddyfile --adapter caddyfile
compose up -d --wait --no-build --remove-orphans api caddy

attempt=1
while [ "$attempt" -le 30 ]; do
	if curl --fail --silent --show-error "https://${site_address}/readyz" >/dev/null; then
		printf '%s\n' "StrideCrew API is ready at https://${site_address}."
		exit 0
	fi
	attempt=$((attempt + 1))
	sleep 2
done

compose ps
compose logs --tail 100 api caddy
fail "public HTTPS readiness did not succeed"
