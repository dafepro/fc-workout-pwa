#!/bin/sh

set -eu

SCRIPT_DIRECTORY=$(CDPATH='' cd -- "$(dirname -- "$0")" && pwd)
plaintext_directory=${1:-"$SCRIPT_DIRECTORY/plaintext"}
recipients_file=${2:-"$SCRIPT_DIRECTORY/production-recipients.txt"}
output_file=${3:-"$SCRIPT_DIRECTORY/production.tar.gz.age"}
set -- backup-s3.env cloudflare.env deploy.env deploy_ssh_key known_hosts

fail() {
	printf '%s\n' "error: $*" >&2
	exit 1
}
for command_name in age find grep install mktemp sort tar; do
	command -v "$command_name" >/dev/null 2>&1 || fail "$command_name is required"
done
[ -d "$plaintext_directory" ] || fail "plaintext directory is missing: $plaintext_directory"
[ -f "$recipients_file" ] || fail "recipient file is missing: $recipients_file"
grep -Eq '^age1[0-9a-z]+$' "$recipients_file" || fail "recipient file contains no age X25519 recipient"

for name do
	path="$plaintext_directory/$name"
	[ -f "$path" ] && [ ! -L "$path" ] || fail "$name must be a regular plaintext file"
done
unexpected=$(find "$plaintext_directory" -mindepth 1 -maxdepth 1 -type f \
	! -name backup-s3.env ! -name cloudflare.env ! -name deploy.env \
	! -name deploy_ssh_key ! -name known_hosts -print)
[ -z "$unexpected" ] || fail "plaintext directory contains an unexpected file"
if grep -Eqi 'replace-me|example\.com|ACCOUNT_ID|BEGIN PLACEHOLDER' "$plaintext_directory"/*; then
	fail "plaintext bundle still contains a placeholder"
fi

stage=$(mktemp -d)
temporary_output="${output_file}.tmp.$$"
trap 'rm -rf -- "$stage"; rm -f -- "$temporary_output"' EXIT HUP INT TERM
for name do
	install -m 0600 "$plaintext_directory/$name" "$stage/$name"
done

tar --sort=name --mtime='UTC 1970-01-01' --owner=0 --group=0 --numeric-owner \
	-C "$stage" -czf - "$@" |
	age --encrypt -R "$recipients_file" -o "$temporary_output"
[ -s "$temporary_output" ] || fail "encrypted bundle was not created"
mv -- "$temporary_output" "$output_file"
chmod 0600 "$output_file"
printf '%s\n' "Sealed the production deployment bundle at $output_file."
