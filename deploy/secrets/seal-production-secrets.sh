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
for command_name in age basename find grep install mktemp sed sort ssh-keygen tail tar; do
	command -v "$command_name" >/dev/null 2>&1 || fail "$command_name is required"
done
[ -d "$plaintext_directory" ] || fail "plaintext directory is missing: $plaintext_directory"
[ -f "$recipients_file" ] || fail "recipient file is missing: $recipients_file"
recipient_count=$(grep -Ec '^age1[0-9a-z]+$' "$recipients_file" || true)
[ "$recipient_count" -ge 2 ] || fail "recipient file must contain separate operator and CI age X25519 recipients"
if grep -Eqi 'replace|example|placeholder' "$recipients_file"; then
	fail "recipient file still contains a placeholder"
fi

for name do
	path="$plaintext_directory/$name"
	[ -f "$path" ] && [ ! -L "$path" ] || fail "$name must be a regular plaintext file"
done
unexpected=$(find "$plaintext_directory" -mindepth 1 -maxdepth 1 -type f \
	! -name backup-s3.env ! -name cloudflare.env ! -name deploy.env \
	! -name deploy_ssh_key ! -name known_hosts -print)
[ -z "$unexpected" ] || fail "plaintext directory contains an unexpected file"
placeholder_files=$(grep -Eil 'replace-me|example\.com|ACCOUNT_ID\.r2|BEGIN PLACEHOLDER' "$plaintext_directory"/* || true)
if [ -n "$placeholder_files" ]; then
	placeholder_names=
	for path in $placeholder_files; do
		placeholder_names="$placeholder_names $(basename "$path")"
	done
	fail "plaintext bundle still contains a placeholder in:$placeholder_names"
fi

stage=$(mktemp -d)
temporary_output="${output_file}.tmp.$$"
trap 'rm -rf -- "$stage"; rm -f -- "$temporary_output"' EXIT HUP INT TERM
for name do
	install -m 0600 "$plaintext_directory/$name" "$stage/$name"
done

deploy_host=$(sed -n 's/^DEPLOY_HOST=//p' "$stage/deploy.env" | tail -n 1)
carriage_return=$(printf '\r')
deploy_host=${deploy_host%"$carriage_return"}
case "$deploy_host" in
	\"*\") deploy_host=${deploy_host#\"}; deploy_host=${deploy_host%\"} ;;
	\'*) deploy_host=${deploy_host#\'}; deploy_host=${deploy_host%\'} ;;
esac
case "$deploy_host" in
	*[!A-Za-z0-9.-]*|"") fail "deploy.env has an invalid DEPLOY_HOST" ;;
esac
ssh-keygen -y -P '' -f "$stage/deploy_ssh_key" >/dev/null 2>&1 ||
	fail "deploy_ssh_key must be a valid passphrase-free SSH private key"
ssh-keygen -F "$deploy_host" -f "$stage/known_hosts" >/dev/null 2>&1 ||
	fail "known_hosts has no verified entry for DEPLOY_HOST ($deploy_host)"

tar --sort=name --mtime='UTC 1970-01-01' --owner=0 --group=0 --numeric-owner \
	-C "$stage" -czf - "$@" |
	age --encrypt -R "$recipients_file" -o "$temporary_output"
[ -s "$temporary_output" ] || fail "encrypted bundle was not created"
mv -- "$temporary_output" "$output_file"
chmod 0600 "$output_file"
printf '%s\n' "Sealed the production deployment bundle at $output_file."
