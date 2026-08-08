#!/bin/sh

set -eu

SCRIPT_DIRECTORY=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
. "$SCRIPT_DIRECTORY/lib.sh"

"$SCRIPT_DIRECTORY/preflight.sh" "$ENV_FILE"
site_address=$(require_env_value CADDY_SITE_ADDRESS)
api_image=$(require_env_value API_IMAGE)

case "$api_image" in
	zoomigo-api:*)
		printf '%s\n' "Building local development image $api_image."
		compose pull caddy
		compose build --pull api
		;;
	*)
		printf '%s\n' "Pulling reviewed production image $api_image."
		compose pull api caddy
		;;
esac
compose run --rm --no-deps caddy caddy validate --config /etc/caddy/Caddyfile --adapter caddyfile
compose up -d --wait --no-build --remove-orphans api caddy

# Probe the API container directly before the public URL. The public probe
# leaves the host, reaches Cloudflare, and comes back in, so on its own it
# cannot distinguish "the application is broken" from "the edge is
# misconfigured" -- a Cloudflare SSL mode of Flexible, a missing DNS record, and
# a crashed container all present as the same timeout. Checking locally first
# splits those apart in the failure message.
attempt=1
while [ "$attempt" -le 30 ]; do
	if compose exec -T api wget -q --spider http://127.0.0.1:8080/readyz 2>/dev/null; then
		printf '%s\n' "The API container is answering /readyz locally."
		break
	fi
	if [ "$attempt" -eq 30 ]; then
		compose ps
		compose logs --tail 100 api
		fail "the API container never answered /readyz locally; this is the application, not Cloudflare"
	fi
	attempt=$((attempt + 1))
	sleep 2
done

# Certificate issuance on a host that has never served this name has to finish
# before the public probe can pass, and behind Cloudflare's proxy Caddy falls
# back from TLS-ALPN-01 to HTTP-01 first, so allow considerably longer here than
# for the local check.
attempt=1
while [ "$attempt" -le 90 ]; do
	if curl --fail --silent --show-error --max-time 10 "https://${site_address}/readyz" >/dev/null; then
		printf '%s\n' "ZoomiGo API is ready at https://${site_address}."
		# Superseded release images accumulate on an 8.7 GiB disk that also has to
		# hold the database and backups. The running image is never pruned, and
		# GHCR still has the rest, so an image rollback re-pulls instead of losing
		# anything. Never fail a healthy deploy over reclaiming disk.
		docker image prune --all --force --filter "until=72h" >/dev/null 2>&1 || true
		exit 0
	fi
	attempt=$((attempt + 1))
	sleep 2
done

compose ps
compose logs --tail 100 api caddy
fail "the API is healthy locally but https://${site_address}/readyz did not succeed; check the Cloudflare DNS record for ${site_address}, that its SSL/TLS mode is Full or Full (strict) rather than Flexible, and that the firewall admits Cloudflare on 80 and 443"
