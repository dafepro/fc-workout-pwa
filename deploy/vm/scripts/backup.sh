#!/bin/sh

set -eu

SCRIPT_DIRECTORY=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
. "$SCRIPT_DIRECTORY/lib.sh"

require_command docker
require_env_file
require_env_value DATA_DIR >/dev/null
require_env_value BACKUP_DIR >/dev/null
require_env_value RESTORE_DIR >/dev/null
application_version=$(require_env_value APP_VERSION)

archive_name="stridecrew-backup-$(date -u +%Y%m%dT%H%M%SZ)-v1.tar.gz"
archive_path="/backups/${archive_name}"

compose run --rm backup create \
	--database-url file:/data/stridecrew.db \
	--output "$archive_path" \
	--app-version "$application_version"
compose run --rm backup verify --archive "$archive_path"

printf '%s\n' "Created and verified $archive_name."
printf '%s\n' "Warning: format v1 is not encrypted; keep it on this protected host."
