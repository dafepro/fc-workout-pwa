#!/bin/sh

set -eu

SCRIPT_DIRECTORY=$(CDPATH='' cd -- "$(dirname -- "$0")" && pwd)
REPOSITORY_ROOT=$(CDPATH='' cd -- "$SCRIPT_DIRECTORY/../.." && pwd)
release_sha=${1:?usage: release.sh RELEASE_SHA}

for command_name in node pnpm ssh; do
	command -v "$command_name" >/dev/null 2>&1 || { printf '%s\n' "error: $command_name is required" >&2; exit 1; }
done

case ${PUBLISH_API_IMAGE:-false} in
	true) "$SCRIPT_DIRECTORY/publish-image.sh" "$release_sha" ;;
	false) ;;
	*) printf '%s\n' "error: PUBLISH_API_IMAGE must be true or false" >&2; exit 1 ;;
esac

: "${DEPLOY_HOST:?DEPLOY_HOST is required}"
: "${DEPLOY_USER:?DEPLOY_USER is required}"
: "${ZOOMIGO_API_BASE_URL:?ZOOMIGO_API_BASE_URL is required}"
: "${ZOOMIGO_DEPLOY_SSH_KEY:?ZOOMIGO_DEPLOY_SSH_KEY is required}"
: "${BACKUP_S3_ENDPOINT:?BACKUP_S3_ENDPOINT is required}"
: "${BACKUP_S3_BUCKET:?BACKUP_S3_BUCKET is required}"
: "${BACKUP_S3_ACCESS_KEY_ID:?BACKUP_S3_ACCESS_KEY_ID is required}"
: "${BACKUP_S3_SECRET_ACCESS_KEY:?BACKUP_S3_SECRET_ACCESS_KEY is required}"
: "${STAFF_SECRET_KEY:?STAFF_SECRET_KEY is required; it protects stored staff second factors}"
: "${PLAYER_LOGIN_URL:?PLAYER_LOGIN_URL is required}"
: "${STAFF_SETUP_URL:?STAFF_SETUP_URL is required}"
: "${CLOUDFLARE_ACCOUNT_ID:?CLOUDFLARE_ACCOUNT_ID is required}"
: "${CLOUDFLARE_API_TOKEN:?CLOUDFLARE_API_TOKEN is required}"
for console_url in "$ZOOMIGO_API_BASE_URL" "$PLAYER_LOGIN_URL" "$STAFF_SETUP_URL"; do
	case "$console_url" in https://*) ;; *) printf '%s\n' "error: $console_url must use HTTPS" >&2; exit 1 ;; esac
done

cd "$REPOSITORY_ROOT"
pnpm install --frozen-lockfile
pnpm build
analytics_database_id=$(pnpm exec wrangler d1 list --json | node "$SCRIPT_DIRECTORY/resolve-analytics-d1.mjs")
if [ -n "$analytics_database_id" ]; then
	: "${ANALYTICS_SUBJECT_KEY:?ANALYTICS_SUBJECT_KEY is required when analytics is enabled}"
fi
node "$SCRIPT_DIRECTORY/configure-worker.mjs" \
	"$REPOSITORY_ROOT/dist/server/wrangler.json" \
	"$REPOSITORY_ROOT/deploy/production.json" \
	"$ZOOMIGO_API_BASE_URL" \
	"$analytics_database_id"

private_root=$(mktemp -d)
secrets_directory="$private_root/secrets"
trap 'rm -rf -- "$private_root"' EXIT HUP INT TERM
mkdir -m 0700 -- "$secrets_directory"
(
	umask 077
	printf '%s\n' "$ZOOMIGO_DEPLOY_SSH_KEY" >"$secrets_directory/deploy_ssh_key"
	cp -- "$REPOSITORY_ROOT/infra/known_hosts" "$secrets_directory/known_hosts"
	cat >"$secrets_directory/backup-s3.env" <<-EOF
	BACKUP_S3_ENDPOINT='$BACKUP_S3_ENDPOINT'
	BACKUP_S3_BUCKET='$BACKUP_S3_BUCKET'
	BACKUP_S3_PROVIDER='${BACKUP_S3_PROVIDER:-Cloudflare}'
	BACKUP_S3_REGION='${BACKUP_S3_REGION:-auto}'
	BACKUP_S3_ACCESS_KEY_ID='$BACKUP_S3_ACCESS_KEY_ID'
	BACKUP_S3_SECRET_ACCESS_KEY='$BACKUP_S3_SECRET_ACCESS_KEY'
	EOF
	# Unquoted values, because set-console-settings.sh writes each line into the
	# compose environment file verbatim and Compose does not strip quotes.
	cat >"$secrets_directory/console.env" <<-EOF
	STAFF_SECRET_KEY=$STAFF_SECRET_KEY
	PLAYER_LOGIN_URL=$PLAYER_LOGIN_URL
	STAFF_SETUP_URL=$STAFF_SETUP_URL
	PRODUCTION_DATA_APPROVED=${PRODUCTION_DATA_APPROVED:-false}
	EOF
)
"$SCRIPT_DIRECTORY/deploy-vm.sh" "$secrets_directory" "$release_sha"

if [ -n "$analytics_database_id" ]; then
	pnpm exec wrangler d1 migrations apply ANALYTICS_DB --remote --config dist/server/wrangler.json
fi
pnpm exec wrangler deploy --config dist/server/wrangler.json
if [ -n "$analytics_database_id" ]; then
	printf '%s' "$ANALYTICS_SUBJECT_KEY" | pnpm exec wrangler secret put ANALYTICS_SUBJECT_KEY --config dist/server/wrangler.json
fi

# The console gates on staff sign-in and TOTP, in the application, so a release
# puts no gate secret on the Worker and no gate in front of it.

printf '%s\n' "Released ZoomiGo $release_sha to the VM and Cloudflare Worker."
