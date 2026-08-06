#!/bin/sh

set -eu

SCRIPT_DIRECTORY=$(CDPATH='' cd -- "$(dirname -- "$0")" && pwd)
for command_name in age node ssh-keygen ssh-keyscan tofu; do
	command -v "$command_name" >/dev/null 2>&1 || {
		printf '%s\n' "error: $command_name is required" >&2
		exit 1
	}
done

exec node "$SCRIPT_DIRECTORY/adopt-host.mjs" "$@"
