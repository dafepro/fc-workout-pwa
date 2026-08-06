#!/bin/sh

set -eu

SCRIPT_DIRECTORY=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
. "$SCRIPT_DIRECTORY/lib.sh"

require_env_file
[ "$(id -u)" -eq 0 ] || fail "run prepare-host.sh as root (for example with sudo)"

data_directory=$(require_env_value DATA_DIR)
backup_directory=$(require_env_value BACKUP_DIR)
restore_directory=$(require_env_value RESTORE_DIR)
admin_output_directory=$(require_env_value ADMIN_OUTPUT_DIR)

validate_host_directory DATA_DIR "$data_directory"
validate_host_directory BACKUP_DIR "$backup_directory"
validate_host_directory RESTORE_DIR "$restore_directory"
validate_host_directory ADMIN_OUTPUT_DIR "$admin_output_directory"

[ "$data_directory" != "$backup_directory" ] || fail "DATA_DIR and BACKUP_DIR must differ"
[ "$data_directory" != "$restore_directory" ] || fail "DATA_DIR and RESTORE_DIR must differ"
[ "$backup_directory" != "$restore_directory" ] || fail "BACKUP_DIR and RESTORE_DIR must differ"
[ "$admin_output_directory" != "$data_directory" ] || fail "ADMIN_OUTPUT_DIR and DATA_DIR must differ"
[ "$admin_output_directory" != "$backup_directory" ] || fail "ADMIN_OUTPUT_DIR and BACKUP_DIR must differ"
[ "$admin_output_directory" != "$restore_directory" ] || fail "ADMIN_OUTPUT_DIR and RESTORE_DIR must differ"

for directory in "$data_directory" "$backup_directory" "$restore_directory" "$admin_output_directory"; do
	install -d -m 0700 -o 65532 -g 65532 "$directory"
done

printf '%s\n' "Prepared ZoomiGo data directories for container uid/gid 65532."
