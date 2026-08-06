#!/bin/sh

# Compatibility entry point for older operator commands. New configuration is
# provider-neutral and lives in upload-backup-s3.sh.
set -eu
SCRIPT_DIRECTORY=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
exec "$SCRIPT_DIRECTORY/upload-backup-s3.sh" "$@"
