#!/bin/sh

set -eu

SCRIPT_DIRECTORY=$(CDPATH='' cd -- "$(dirname -- "$0")" && pwd)
REPOSITORY_ROOT=$(CDPATH='' cd -- "$SCRIPT_DIRECTORY/../.." && pwd)
release_sha=${1:?usage: deploy-dev.sh RELEASE_SHA}

: "${DEPLOY_HOST:?DEPLOY_HOST is required}"
: "${DEV_DEPLOY_SSH_KEY_FILE:?DEV_DEPLOY_SSH_KEY_FILE is required}"
: "${DEV_KNOWN_HOSTS_FILE:?DEV_KNOWN_HOSTS_FILE is required}"
: "${DEV_API_GATEWAY_TOKEN:?DEV_API_GATEWAY_TOKEN is required}"
: "${DEV_RESET_KEY:?DEV_RESET_KEY is required}"
: "${DEV_FIXTURE_SEED:?DEV_FIXTURE_SEED is required}"
: "${DEV_ADMIN_PASSWORD:?DEV_ADMIN_PASSWORD is required}"
: "${STAFF_SECRET_KEY:?STAFF_SECRET_KEY is required}"
: "${ZOOMIGO_API_BASE_URL:?ZOOMIGO_API_BASE_URL is required}"
: "${DEV_ACCESS_PASSWORD:?DEV_ACCESS_PASSWORD is required}"
: "${DEV_ACCESS_SESSION_KEY:?DEV_ACCESS_SESSION_KEY is required}"
: "${CLOUDFLARE_ACCOUNT_ID:?CLOUDFLARE_ACCOUNT_ID is required}"
: "${CLOUDFLARE_API_TOKEN:?CLOUDFLARE_API_TOKEN is required}"
case "$release_sha" in *[!0-9a-f]*|"") printf '%s\n' "error: invalid release SHA" >&2; exit 1 ;; esac
[ "${#release_sha}" -eq 40 ] || { printf '%s\n' "error: invalid release SHA" >&2; exit 1; }

for value in "$DEV_API_GATEWAY_TOKEN" "$DEV_RESET_KEY" "$DEV_FIXTURE_SEED" "$DEV_ADMIN_PASSWORD"; do
	case "$value" in *[!A-Za-z0-9_-]*) printf '%s\n' "error: dev VM secrets must be URL-safe strings" >&2; exit 1 ;; esac
done
case "$STAFF_SECRET_KEY" in *[!A-Za-z0-9+/=]*) printf '%s\n' "error: STAFF_SECRET_KEY must be base64" >&2; exit 1 ;; esac

worker_config="$REPOSITORY_ROOT/dist/server/wrangler.json"
cd "$REPOSITORY_ROOT"
pnpm install --frozen-lockfile
pnpm build
node "$SCRIPT_DIRECTORY/configure-worker.mjs" \
	"$worker_config" \
	"$REPOSITORY_ROOT/deploy/dev.json" \
	"$ZOOMIGO_API_BASE_URL"

private_root=$(mktemp -d)
trap 'rm -rf -- "$private_root"' EXIT HUP INT TERM
environment_file="$private_root/dev.env"
umask 077
cat >"$environment_file" <<EOF
COMPOSE_PROJECT_NAME=zoomigo-dev
API_IMAGE=ghcr.io/dafepro/fc-workout-pwa/api:sha-dev-$release_sha
APP_VERSION=$release_sha
APP_ENV=dev
GO_BUILD_TAGS=dev
ENABLE_DEV_ACCESS=true
DEV_API_GATEWAY_TOKEN=$DEV_API_GATEWAY_TOKEN
DEV_RESET_KEY=$DEV_RESET_KEY
DEV_FIXTURE_SEED=$DEV_FIXTURE_SEED
DEV_ADMIN_PASSWORD=$DEV_ADMIN_PASSWORD
BACKUP_AGE_RECIPIENT=age1devpreviewnotused
BACKUP_S3_UPLOAD_ENABLED=false
LOCAL_BACKUP_RETENTION_DAYS=1
PRODUCTION_DATA_APPROVED=false
STAFF_SECRET_KEY=$STAFF_SECRET_KEY
PLAYER_LOGIN_URL=https://dev.zoomigo.quicktrack.cc/login
STAFF_SETUP_URL=https://dev.zoomigo.quicktrack.cc/staff/setup
CADDY_SITE_ADDRESS=api.dev.zoomigo.quicktrack.cc
PWA_ORIGIN=https://dev.zoomigo.quicktrack.cc
TEAM_TIME_ZONE=America/Chicago
DATA_DIR=/var/lib/zoomigo-dev/data
BACKUP_DIR=/var/lib/zoomigo-dev/backups
RESTORE_DIR=/var/lib/zoomigo-dev/restore
ADMIN_OUTPUT_DIR=/var/lib/zoomigo-dev/admin-output
HTTP_BIND_ADDRESS=0.0.0.0
HTTP_PORT=80
HTTPS_BIND_ADDRESS=0.0.0.0
HTTPS_PORT=443
EOF

ssh_target="${DEPLOY_USER:-zoomigo}@${DEPLOY_HOST}"
run_ssh() {
	ssh -i "$DEV_DEPLOY_SSH_KEY_FILE" \
		-o BatchMode=yes \
		-o IdentitiesOnly=yes \
		-o StrictHostKeyChecking=yes \
		-o "UserKnownHostsFile=$DEV_KNOWN_HOSTS_FILE" \
		"$ssh_target" "$@"
}

run_ssh "sudo -n cloud-init status --wait"
run_ssh "set -eu; cd /opt/app; test -z \"\$(git status --porcelain --untracked-files=no)\"; git fetch --depth=1 origin '$release_sha'; git checkout --detach '$release_sha'"
run_ssh "umask 077; cat > /opt/app/deploy/vm/.env" <"$environment_file"
run_ssh "set -eu; cd /opt/app/deploy/vm; sudo -n ./scripts/prepare-host.sh .env; ./scripts/preflight.sh .env; ./scripts/deploy.sh .env"

pnpm exec wrangler deploy --config "$worker_config"
printf '%s' "$DEV_ACCESS_PASSWORD" | pnpm exec wrangler secret put DEV_ACCESS_PASSWORD --config "$worker_config"
printf '%s' "$DEV_ACCESS_SESSION_KEY" | pnpm exec wrangler secret put DEV_ACCESS_SESSION_KEY --config "$worker_config"
printf '%s' "$DEV_API_GATEWAY_TOKEN" | pnpm exec wrangler secret put ZOOMIGO_API_GATEWAY_TOKEN --config "$worker_config"

printf '%s\n' "Deployed dev.zoomigo.quicktrack.cc at $release_sha."
