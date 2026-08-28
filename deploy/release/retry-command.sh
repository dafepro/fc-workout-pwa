#!/bin/sh

set -eu

attempts=${1:?usage: retry-command.sh ATTEMPTS DELAY_SECONDS COMMAND [ARG...]}
delay_seconds=${2:?usage: retry-command.sh ATTEMPTS DELAY_SECONDS COMMAND [ARG...]}
shift 2
[ "$#" -gt 0 ] || { printf '%s\n' "error: a command is required" >&2; exit 2; }

case "$attempts:$delay_seconds" in
	*[!0-9:]*|0:*|*:)
		printf '%s\n' "error: attempts and delay must be positive integers" >&2
		exit 2
		;;
esac

attempt=1
while :; do
	if "$@"; then
		exit 0
	else
		status=$?
	fi
	if [ "$attempt" -ge "$attempts" ]; then
		printf '%s\n' "error: $1 failed after $attempt attempts" >&2
		exit "$status"
	fi
	printf '%s\n' "$1 failed (attempt $attempt/$attempts); retrying in ${delay_seconds}s" >&2
	attempt=$((attempt + 1))
	sleep "$delay_seconds"
done
