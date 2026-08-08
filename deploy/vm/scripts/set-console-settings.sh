#!/bin/sh

# Upserts the console's settings into the compose environment file, reading
# KEY=VALUE lines from standard input so a secret never appears in an argv where
# any process on the host could read it. The same reason deploy-vm.sh installs
# the backup credential this way.
#
# Only the keys listed below are accepted. A release must not be able to set an
# arbitrary environment variable on the API container by writing a line here.

set -eu

SCRIPT_DIRECTORY=$(CDPATH='' cd -- "$(dirname -- "$0")" && pwd)
# shellcheck disable=SC1091
. "$SCRIPT_DIRECTORY/lib.sh"

require_env_file

allowed_key() {
	case "$1" in
		STAFF_SECRET_KEY|PLAYER_LOGIN_URL|STAFF_SETUP_URL|PRODUCTION_DATA_APPROVED) return 0 ;;
		*) return 1 ;;
	esac
}

# install(1) under sudo creates its destination owned by the effective user, so
# the ownership is captured and restored; otherwise this rewrites a 0600 file as
# root:root and the next unprivileged step fails with "Permission denied".
environment_uid=$(stat -c '%u' "$ENV_FILE")
environment_gid=$(stat -c '%g' "$ENV_FILE")

working=$(mktemp)
# Both, because the loop below writes a sibling and an interrupted run would
# otherwise leave a copy of the staff key behind in the temporary directory.
trap 'rm -f -- "$working" "$working.next"' EXIT HUP INT TERM
umask 077
cp -- "$ENV_FILE" "$working"

while IFS= read -r line; do
	[ -n "$line" ] || continue
	case "$line" in \#*) continue ;; esac
	key=${line%%=*}
	value=${line#*=}
	[ "$key" != "$line" ] || fail "console settings must be KEY=VALUE lines"
	allowed_key "$key" || fail "$key is not a console setting this script may write"
	case "$value" in *[!!-~\ ]*) fail "$key contains a character that cannot go in an environment file" ;; esac
	grep -v "^${key}=" "$working" >"$working.next" || true
	printf '%s=%s\n' "$key" "$value" >>"$working.next"
	mv -- "$working.next" "$working"
done

install -m 0600 "$working" "$ENV_FILE"
chown "$environment_uid:$environment_gid" "$ENV_FILE"
printf '%s\n' "Applied the console settings to $ENV_FILE."
