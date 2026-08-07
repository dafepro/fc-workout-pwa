#!/bin/sh

set -eu

secrets_directory=${1:?usage: deploy-vm.sh OPENED_SECRETS_DIRECTORY RELEASE_SHA}
release_sha=${2:?usage: deploy-vm.sh OPENED_SECRETS_DIRECTORY RELEASE_SHA}

: "${DEPLOY_HOST:?DEPLOY_HOST is required}"
: "${DEPLOY_USER:?DEPLOY_USER is required}"
case "$DEPLOY_HOST" in *[!A-Za-z0-9.-]*|"") printf '%s\n' "invalid DEPLOY_HOST" >&2; exit 1 ;; esac
case "$DEPLOY_USER" in *[!A-Za-z0-9_-]*|"") printf '%s\n' "invalid DEPLOY_USER" >&2; exit 1 ;; esac
case "$release_sha" in *[!0-9a-f]*|"") printf '%s\n' "invalid release SHA" >&2; exit 1 ;; esac
[ "${#release_sha}" -eq 40 ] || { printf '%s\n' "invalid release SHA" >&2; exit 1; }

identity_file="$secrets_directory/deploy_ssh_key"
known_hosts_file="$secrets_directory/known_hosts"
backup_environment="$secrets_directory/backup-s3.env"
chmod 0600 "$identity_file" "$known_hosts_file" "$backup_environment"
ssh_target="${DEPLOY_USER}@${DEPLOY_HOST}"

run_ssh() {
	ssh -i "$identity_file" \
		-o BatchMode=yes \
		-o IdentitiesOnly=yes \
		-o StrictHostKeyChecking=yes \
		-o "UserKnownHostsFile=$known_hosts_file" \
		"$ssh_target" "$@"
}

# A fresh IaC-created host is not ready until cloud-init has completed the exact
# release checkout, storage preparation, and systemd installation.
run_ssh "sudo -n cloud-init status --wait"

# Install/rotate the backup credential through standard input, never an argv.
run_ssh "sudo -n install -d -m 0755 /etc/zoomigo && sudo -n sh -c 'umask 077; cat > /etc/zoomigo/backup-s3.env'" <"$backup_environment"

# Existing installations must finish a backup before the checkout changes the
# scripts beneath systemd. A brand-new host has no database to preserve yet.
run_ssh "if sudo -n test -f /var/lib/zoomigo/data/zoomigo.db; then sudo -n systemctl start zoomigo-backup.service; fi"

image="ghcr.io/dafepro/fc-workout-pwa/api:sha-$release_sha"
run_ssh "set -eu; cd /opt/app; test -z \"\$(git status --porcelain --untracked-files=no)\"; git fetch --depth=1 origin '$release_sha'; git checkout --detach '$release_sha'; cd deploy/vm; sudo -n ./scripts/set-release.sh .env '$image' '$release_sha'; sudo -n ./scripts/prepare-host.sh .env; ./scripts/preflight.sh .env; ./scripts/deploy.sh .env; sudo -n ./scripts/install-backup-service.sh; sudo -n systemctl enable --now zoomigo-backup.timer; sudo -n systemctl start zoomigo-backup.service; sudo -n ./scripts/production-check.sh .env --check-s3"

printf '%s\n' "Deployed and verified ZoomiGo VM release $release_sha."
