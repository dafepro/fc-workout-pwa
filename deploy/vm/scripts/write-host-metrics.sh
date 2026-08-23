#!/bin/sh

set -eu

SCRIPT_DIRECTORY=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
. "$SCRIPT_DIRECTORY/lib.sh"

require_env_file
[ "$(env_value ENABLE_OBSERVABILITY)" = true ] || exit 0
observability_directory=$(require_env_value OBSERVABILITY_DATA_DIR)
metrics_directory="$observability_directory/textfile"
[ -d "$metrics_directory" ] || fail "observability textfile directory does not exist"

filesystem_values=$(df -PB1 "$observability_directory" | awk 'NR == 2 { print $2 " " $4 }')
filesystem_size_bytes=${filesystem_values%% *}
available_bytes=${filesystem_values#* }
memory_available_bytes=$(awk '/^MemAvailable:/ { print $2 * 1024 }' /proc/meminfo)
temporary_metrics=$(mktemp "$metrics_directory/.host.XXXXXX")
trap 'rm -f -- "$temporary_metrics"' EXIT HUP INT TERM
{
	printf '# HELP zoomigo_host_filesystem_avail_bytes Bytes available on the application filesystem.\n'
	printf '# TYPE zoomigo_host_filesystem_avail_bytes gauge\n'
	printf 'zoomigo_host_filesystem_avail_bytes %s\n' "$available_bytes"
	printf '# HELP zoomigo_host_filesystem_size_bytes Size of the application filesystem in bytes.\n'
	printf '# TYPE zoomigo_host_filesystem_size_bytes gauge\n'
	printf 'zoomigo_host_filesystem_size_bytes %s\n' "$filesystem_size_bytes"
	printf '# HELP zoomigo_host_mem_available_bytes Host memory currently available in bytes.\n'
	printf '# TYPE zoomigo_host_mem_available_bytes gauge\n'
	printf 'zoomigo_host_mem_available_bytes %s\n' "$memory_available_bytes"
	printf '# HELP zoomigo_container_restart_count Docker restart count for a bounded service.\n'
	printf '# TYPE zoomigo_container_restart_count gauge\n'
	for service_name in api caddy alloy; do
		container_id=$(compose --profile observability ps -q "$service_name" 2>/dev/null || true)
		[ -n "$container_id" ] || continue
		restarts=$(docker inspect --format '{{.RestartCount}}' "$container_id")
		printf 'zoomigo_container_restart_count{service="%s"} %s\n' "$service_name" "$restarts"
	done
} >"$temporary_metrics"
chmod 0600 "$temporary_metrics"
mv -- "$temporary_metrics" "$metrics_directory/zoomigo_host.prom"
trap - EXIT HUP INT TERM
