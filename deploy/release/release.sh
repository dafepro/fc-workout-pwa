#!/bin/sh

set -eu

SCRIPT_DIRECTORY=$(CDPATH='' cd -- "$(dirname -- "$0")" && pwd)
REPOSITORY_ROOT=$(CDPATH='' cd -- "$SCRIPT_DIRECTORY/../.." && pwd)
identity_file=${1:?usage: release.sh DEPLOYMENT_AGE_IDENTITY RELEASE_SHA [ENCRYPTED_BUNDLE]}
release_sha=${2:?usage: release.sh DEPLOYMENT_AGE_IDENTITY RELEASE_SHA [ENCRYPTED_BUNDLE]}
bundle=${3:-"$REPOSITORY_ROOT/deploy/secrets/production.tar.gz.age"}

for command_name in node pnpm ssh; do
	command -v "$command_name" >/dev/null 2>&1 || { printf '%s\n' "error: $command_name is required" >&2; exit 1; }
done

case ${PUBLISH_API_IMAGE:-false} in
	true) "$SCRIPT_DIRECTORY/publish-image.sh" "$release_sha" ;;
	false) ;;
	*) printf '%s\n' "error: PUBLISH_API_IMAGE must be true or false" >&2; exit 1 ;;
esac

private_root=$(mktemp -d)
secrets_directory="$private_root/secrets"
trap 'rm -rf -- "$private_root"' EXIT HUP INT TERM
"$REPOSITORY_ROOT/deploy/secrets/open-production-secrets.sh" \
	"$identity_file" "$bundle" "$secrets_directory"

set -a
# Opened from the validated encrypted bundle.
# shellcheck disable=SC1091
. "$secrets_directory/deploy.env"
set +a
: "${ZOOMIGO_API_BASE_URL:?ZOOMIGO_API_BASE_URL is required}"
case "$ZOOMIGO_API_BASE_URL" in https://*) ;; *) printf '%s\n' "error: ZOOMIGO_API_BASE_URL must use HTTPS" >&2; exit 1 ;; esac

cd "$REPOSITORY_ROOT"
pnpm install --frozen-lockfile
pnpm build
node "$SCRIPT_DIRECTORY/configure-worker.mjs" \
	"$REPOSITORY_ROOT/dist/server/wrangler.json" \
	"$REPOSITORY_ROOT/deploy/production.json" \
	"$ZOOMIGO_API_BASE_URL"
"$SCRIPT_DIRECTORY/deploy-vm.sh" "$secrets_directory" "$release_sha"

# Keep provider credentials out of dependency installation and application
# builds. They exist in the process environment only for the Worker upload.
set -a
# Opened from the validated encrypted bundle.
# shellcheck disable=SC1091
. "$secrets_directory/cloudflare.env"
set +a
: "${CLOUDFLARE_ACCOUNT_ID:?CLOUDFLARE_ACCOUNT_ID is required}"
: "${CLOUDFLARE_API_TOKEN:?CLOUDFLARE_API_TOKEN is required}"
pnpm exec wrangler deploy --config dist/server/wrangler.json

printf '%s\n' "Released ZoomiGo $release_sha to the VM and Cloudflare Worker."
