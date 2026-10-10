#!/bin/sh

set -eu

SCRIPT_DIRECTORY=$(CDPATH='' cd -- "$(dirname -- "$0")" && pwd)
REPOSITORY_ROOT=$(CDPATH='' cd -- "$SCRIPT_DIRECTORY/../.." && pwd)
release_sha=${1:?usage: release.sh RELEASE_SHA}

for command_name in node pnpm ssh; do
	command -v "$command_name" >/dev/null 2>&1 || { printf '%s\n' "error: $command_name is required" >&2; exit 1; }
done

artifact_directory=${PRODUCTION_RELEASE_DIRECTORY:?PRODUCTION_RELEASE_DIRECTORY must contain the verified production artifact}
node "$REPOSITORY_ROOT/scripts/artifact-provenance.mjs" verify production "$release_sha" \
	"$artifact_directory/worker.tgz" "$artifact_directory/release-manifest.json"
API_IMAGE_OVERRIDE="ghcr.io/dafepro/fc-workout-pwa/api@$(node -e 'process.stdout.write(JSON.parse(require("fs").readFileSync(process.argv[1],"utf8")).apiDigest)' "$artifact_directory/release-manifest.json")"
export API_IMAGE_OVERRIDE
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
case ${ENABLE_OBSERVABILITY:-false} in
	true)
		: "${GRAFANA_LOGS_URL:?GRAFANA_LOGS_URL is required}"
		: "${GRAFANA_LOGS_USERNAME:?GRAFANA_LOGS_USERNAME is required}"
		: "${GRAFANA_LOGS_TOKEN:?GRAFANA_LOGS_TOKEN is required}"
		: "${GRAFANA_METRICS_URL:?GRAFANA_METRICS_URL is required}"
		: "${GRAFANA_METRICS_USERNAME:?GRAFANA_METRICS_USERNAME is required}"
		: "${GRAFANA_METRICS_TOKEN:?GRAFANA_METRICS_TOKEN is required}"
		;;
	false) ;;
	*) printf '%s\n' "error: ENABLE_OBSERVABILITY must be true or false" >&2; exit 1 ;;
esac
for console_url in "$ZOOMIGO_API_BASE_URL" "$PLAYER_LOGIN_URL" "$STAFF_SETUP_URL"; do
	case "$console_url" in https://*) ;; *) printf '%s\n' "error: $console_url must use HTTPS" >&2; exit 1 ;; esac
done

private_root=$(mktemp -d)
trap 'rm -rf -- "$private_root"' EXIT HUP INT TERM
source_root="$private_root/application"
mkdir -m 0700 "$source_root"
tar -xzf "$artifact_directory/worker.tgz" -C "$source_root"
worker_config="$source_root/dist/server/wrangler.json"
[ -f "$worker_config" ] && [ -d "$source_root/drizzle" ] || { printf '%s\n' "error: prebuilt production Worker or matching migrations are missing" >&2; exit 1; }

cd "$REPOSITORY_ROOT"
analytics_approved=${PRODUCT_ANALYTICS_APPROVED:-false}
case "$analytics_approved" in
	true|false) ;;
	*) printf '%s\n' "error: PRODUCT_ANALYTICS_APPROVED must be true or false" >&2; exit 1 ;;
esac
analytics_database_id=""
if [ "$analytics_approved" = true ]; then
	analytics_database_id=$(pnpm exec wrangler d1 list --json | node "$SCRIPT_DIRECTORY/resolve-analytics-d1.mjs")
	[ -n "$analytics_database_id" ] || { printf '%s\n' "error: approved analytics requires its D1 database" >&2; exit 1; }
	: "${ANALYTICS_SUBJECT_KEY:?ANALYTICS_SUBJECT_KEY is required when analytics is enabled}"
fi
node "$SCRIPT_DIRECTORY/configure-worker.mjs" \
	"$worker_config" \
	"$REPOSITORY_ROOT/deploy/production.json" \
	"$ZOOMIGO_API_BASE_URL" \
	"$analytics_database_id" \
	"$analytics_approved"
printf 'Product analytics enabled: %s\n' "$analytics_approved"

secrets_directory="$private_root/secrets"
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
	ENABLE_OBSERVABILITY=${ENABLE_OBSERVABILITY:-false}
	OBSERVABILITY_DATA_DIR=/var/lib/zoomigo/observability
	GRAFANA_LOGS_URL=${GRAFANA_LOGS_URL:-}
	GRAFANA_LOGS_USERNAME=${GRAFANA_LOGS_USERNAME:-}
	GRAFANA_LOGS_TOKEN=${GRAFANA_LOGS_TOKEN:-}
	GRAFANA_METRICS_URL=${GRAFANA_METRICS_URL:-}
	GRAFANA_METRICS_USERNAME=${GRAFANA_METRICS_USERNAME:-}
	GRAFANA_METRICS_TOKEN=${GRAFANA_METRICS_TOKEN:-}
	EOF
)
"$SCRIPT_DIRECTORY/deploy-vm.sh" "$secrets_directory" "$release_sha" "$(git rev-parse HEAD)"

if [ -n "$analytics_database_id" ]; then
	pnpm exec wrangler d1 migrations apply ANALYTICS_DB --remote --config "$worker_config"
fi
pnpm exec wrangler deploy --config "$worker_config"
if [ -n "$analytics_database_id" ]; then
	printf '%s' "$ANALYTICS_SUBJECT_KEY" | pnpm exec wrangler secret put ANALYTICS_SUBJECT_KEY --config "$worker_config"
fi

# The console gates on staff sign-in and TOTP, in the application, so a release
# puts no gate secret on the Worker and no gate in front of it.

printf '%s\n' "Released ZoomiGo $release_sha to the VM and Cloudflare Worker."
