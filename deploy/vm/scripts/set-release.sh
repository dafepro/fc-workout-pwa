#!/bin/sh

set -eu

SCRIPT_DIRECTORY=$(CDPATH='' cd -- "$(dirname -- "$0")" && pwd)
# Sibling library resolved from this script.
# shellcheck disable=SC1091
. "$SCRIPT_DIRECTORY/lib.sh"

image=${2:?usage: set-release.sh ENV_FILE API_IMAGE RELEASE_SHA}
release_sha=${3:?usage: set-release.sh ENV_FILE API_IMAGE RELEASE_SHA}
require_env_file
case "$release_sha" in *[!0-9a-f]*|"") fail "release SHA must be 40 lowercase hexadecimal characters" ;; esac
[ "${#release_sha}" -eq 40 ] || fail "release SHA must be 40 lowercase hexadecimal characters"
case "$image" in *":sha-$release_sha") ;; *) fail "API image must be pinned to the release SHA" ;; esac
[ "$(grep -c '^API_IMAGE=' "$ENV_FILE")" -eq 1 ] || fail "API_IMAGE must appear exactly once in $ENV_FILE"
[ "$(grep -c '^APP_VERSION=' "$ENV_FILE")" -eq 1 ] || fail "APP_VERSION must appear exactly once in $ENV_FILE"

# deploy-vm.sh runs this under sudo but then runs preflight.sh and deploy.sh as
# the unprivileged deploy user, which must still be able to read the file.
# "install" creates its destination owned by the effective user, so capture the
# current ownership first and restore it afterwards; otherwise every release
# silently rewrites this 0600 file as root:root and the next step fails with
# "sed: can't read .env: Permission denied".
environment_uid=$(stat -c '%u' "$ENV_FILE")
environment_gid=$(stat -c '%g' "$ENV_FILE")

temporary_environment=$(mktemp)
trap 'rm -f -- "$temporary_environment"' EXIT HUP INT TERM
sed \
	-e "s|^API_IMAGE=.*$|API_IMAGE=$image|" \
	-e "s|^APP_VERSION=.*$|APP_VERSION=$release_sha|" \
	"$ENV_FILE" >"$temporary_environment"
install -m 0600 "$temporary_environment" "$ENV_FILE"
chown "$environment_uid:$environment_gid" "$ENV_FILE"
printf '%s\n' "Pinned the VM environment to release $release_sha."
