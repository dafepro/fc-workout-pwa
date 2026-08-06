#!/bin/sh

set -eu

SCRIPT_DIRECTORY=$(CDPATH='' cd -- "$(dirname -- "$0")" && pwd)
command -v node >/dev/null 2>&1 || {
	printf '%s\n' "error: node is required" >&2
	exit 1
}
exec node "$SCRIPT_DIRECTORY/manage-production-secrets.mjs" open "$@"
