#!/bin/sh

# Fixed, read-only diagnostics for the production collector. This deliberately
# avoids the container environment and full inspect output because both contain
# scoped Grafana credentials.

set -eu

VM_DIRECTORY=${1:-/opt/app/deploy/vm}
ENV_FILE="$VM_DIRECTORY/.env"

fail() {
	printf '%s\n' "error: $*" >&2
	exit 1
}

[ -f "$ENV_FILE" ] || fail "environment file not found"
cd "$VM_DIRECTORY"

compose() {
	docker compose --env-file "$ENV_FILE" -f compose.yaml --profile observability "$@"
}

container=$(compose ps --quiet alloy)
[ -n "$container" ] || fail "Alloy container is not running"

state=$(docker inspect --format '{{.State.Status}} health={{if .State.Health}}{{.State.Health.Status}}{{else}}none{{end}} restarts={{.RestartCount}}' "$container")
printf '%s\n' "Alloy state: $state"

networks=$(docker inspect --format '{{range $name, $_ := .NetworkSettings.Networks}}{{println $name}}{{end}}' "$container")
printf '%s\n' "Alloy networks:"
printf '%s\n' "$networks"
printf '%s\n' "$networks" | grep -Eq '(^|_)edge$' || fail "Alloy has no egress network"
printf '%s\n' "$networks" | grep -Eq '(^|_)backend$' || fail "Alloy has no backend scrape network"

metrics=$(timeout 10 docker exec "$container" bash -c '
exec 3<>/dev/tcp/127.0.0.1/12345
printf "GET /metrics HTTP/1.1\r\nHost: localhost\r\nConnection: close\r\n\r\n" >&3
cat <&3
' | tr -d '\r' | sed '1,/^$/d') || fail "could not read Alloy internal metrics"

printf '%s\n' "Selected Alloy counters:"
printf '%s\n' "$metrics" |
	grep -E '^(loki_source_docker_target_|loki_write_|prometheus_remote_storage_|prometheus_scrape_)' |
	head -n 120 || true

printf '%s\n' "Recent redacted Alloy warnings:"
docker logs --since 15m "$container" 2>&1 |
	tail -n 120 |
	sed -E 's/glc_[A-Za-z0-9_.=-]+/[REDACTED_TOKEN]/g; s/([Pp]assword|[Tt]oken|[Aa]uthorization)[^ ,}]*/\1=[REDACTED]/g'

printf '%s\n' "Production collector diagnostic completed."
