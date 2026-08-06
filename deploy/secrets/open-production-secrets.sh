#!/bin/sh

set -eu

SCRIPT_DIRECTORY=$(CDPATH='' cd -- "$(dirname -- "$0")" && pwd)
identity_file=${1:?usage: open-production-secrets.sh IDENTITY_FILE [BUNDLE] [OUTPUT_DIRECTORY]}
bundle=${2:-"$SCRIPT_DIRECTORY/production.tar.gz.age"}
output_directory=${3:-"$SCRIPT_DIRECTORY/opened"}
set -- backup-s3.env cloudflare.env deploy.env deploy_ssh_key known_hosts

fail() {
	printf '%s\n' "error: $*" >&2
	exit 1
}
for command_name in age cmp install mktemp sort tar; do
	command -v "$command_name" >/dev/null 2>&1 || fail "$command_name is required"
done
[ -f "$identity_file" ] || fail "age identity file is missing"
[ -f "$bundle" ] || fail "encrypted production bundle is missing"
[ ! -e "$output_directory" ] || fail "output directory already exists"

temporary_archive=$(mktemp)
expected_list=$(mktemp)
actual_list=$(mktemp)
trap 'rm -f -- "$temporary_archive" "$expected_list" "$actual_list"' EXIT HUP INT TERM
chmod 0600 "$temporary_archive"
age --decrypt -i "$identity_file" -o "$temporary_archive" "$bundle"
printf '%s\n' "$@" | sort >"$expected_list"
tar -tzf "$temporary_archive" | sort >"$actual_list"
cmp -s "$expected_list" "$actual_list" || fail "encrypted bundle has an unexpected file layout"

install -d -m 0700 "$output_directory"
tar -xzf "$temporary_archive" -C "$output_directory" --no-same-owner --no-same-permissions
for name do
	path="$output_directory/$name"
	[ -f "$path" ] && [ ! -L "$path" ] || fail "decrypted $name is not a regular file"
	chmod 0600 "$path"
done
printf '%s\n' "Opened the production bundle into a private directory."
