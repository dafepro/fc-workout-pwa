#!/bin/sh

set -eu

SCRIPT_DIRECTORY=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
. "$SCRIPT_DIRECTORY/lib.sh"

require_env_file
[ "$(env_value ENABLE_OBSERVABILITY)" = true ] || exit 0

observability_directory=$(require_env_value OBSERVABILITY_DATA_DIR)
validate_host_directory OBSERVABILITY_DATA_DIR "$observability_directory"
[ -d "$observability_directory" ] || fail "observability data directory does not exist; run prepare-host.sh first"

memory_total_kib=$(awk '/^MemTotal:/ { print $2 }' /proc/meminfo)
memory_available_kib=$(awk '/^MemAvailable:/ { print $2 }' /proc/meminfo)
[ "$memory_total_kib" -ge 900000 ] || fail "observability requires at least a 1 GiB VM class"
[ "$memory_available_kib" -ge 262144 ] || fail "observability requires at least 256 MiB MemAvailable before startup"

free_disk_kib=$(df -Pk "$observability_directory" | awk 'NR == 2 { print $4 }')
[ "$free_disk_kib" -ge 2097152 ] || fail "observability requires at least 2 GiB free disk"

for name in GRAFANA_LOGS_URL GRAFANA_LOGS_USERNAME GRAFANA_LOGS_TOKEN GRAFANA_METRICS_URL GRAFANA_METRICS_USERNAME GRAFANA_METRICS_TOKEN; do
	value=$(require_env_value "$name")
	case "$name" in
		*_URL) case "$value" in https://*) ;; *) fail "$name must use https" ;; esac ;;
		*_TOKEN) [ "${#value}" -ge 32 ] || fail "$name must contain a scoped token" ;;
	esac
done

printf '%s\n' "Observability host admission passed."
