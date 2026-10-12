#!/bin/bash
set -eu
umask 077

SCRIPT_DIRECTORY=$(CDPATH='' cd -- "$(dirname -- "$0")" && pwd)
RUNNER_ROOT="$HOME/.local/share/github-mac-runners"
REPOSITORY=${1:-dafepro/deploy}
case "$REPOSITORY" in
  dafepro/deploy|dafepro/fc-workout-pwa|dafepro/openGym) ;;
  *) echo 'Only the active deploy, ZoomiGo and openGym repositories are supported.' >&2; exit 1 ;;
esac
github() {
  gh "$@"
}

[ "$(github api user --jq .login)" = dafepro ] || {
  echo 'Use gh auth switch --user dafepro before runner setup.' >&2
  exit 1
}
if [ "$(uname -s)/$(uname -m)" != 'Darwin/arm64' ]; then
  echo 'This installer requires the Apple Silicon Mac.' >&2
  exit 1
fi
for command_name in gh jq curl shasum tar; do
  command -v "$command_name" >/dev/null
done
[ -x /opt/homebrew/opt/node@22/bin/node ]
github api "repos/$REPOSITORY" --jq 'select(.permissions.admin == true and .archived == false) | .full_name' |
  /usr/bin/grep -Fx "$REPOSITORY" >/dev/null

RUNNER_SLUG=${REPOSITORY//\//--}
RUNNER_DIRECTORY="$RUNNER_ROOT/$RUNNER_SLUG"
if [ "$REPOSITORY" = dafepro/fc-workout-pwa ] && [ -f "$HOME/.local/share/zoomigo-actions-runner/.runner" ]; then
  RUNNER_DIRECTORY="$HOME/.local/share/zoomigo-actions-runner"
fi

mkdir -p "$RUNNER_ROOT/packages" "$RUNNER_DIRECTORY/guard" "$RUNNER_ROOT/config/$RUNNER_SLUG/docker" \
  "$RUNNER_ROOT/config/$RUNNER_SLUG/gh" "$RUNNER_ROOT/pnpm-store" "$RUNNER_DIRECTORY"
chmod 700 "$RUNNER_ROOT" "$RUNNER_DIRECTORY"
for guard_file in runner-job-guard.sh runner-job-guard.mjs; do
  cp "$SCRIPT_DIRECTORY/$guard_file" "$RUNNER_DIRECTORY/guard/$guard_file.new"
  mv "$RUNNER_DIRECTORY/guard/$guard_file.new" "$RUNNER_DIRECTORY/guard/$guard_file"
done
chmod 700 "$RUNNER_DIRECTORY/guard/runner-job-guard.sh"
printf '{"repository":"%s"}\n' "$REPOSITORY" > "$RUNNER_DIRECTORY/guard/runner-repository.json"
if [ -f "$RUNNER_DIRECTORY/.runner" ]; then
  python3 - "$RUNNER_DIRECTORY/.env" "$RUNNER_DIRECTORY/guard/runner-job-guard.sh" <<'PY'
import sys
from pathlib import Path
p=Path(sys.argv[1]); lines=p.read_text().splitlines()
assert sum(line.startswith('ACTIONS_RUNNER_HOOK_JOB_STARTED=') for line in lines)==1
p.write_text('\n'.join('ACTIONS_RUNNER_HOOK_JOB_STARTED='+sys.argv[2] if line.startswith('ACTIONS_RUNNER_HOOK_JOB_STARTED=') else line for line in lines)+'\n')
PY
  RUNNER_ID=$(jq -r .agentId "$RUNNER_DIRECTORY/.runner")
  github api --method POST "repos/$REPOSITORY/actions/runners/$RUNNER_ID/labels" \
    -f 'labels[]=dcarrell-mac' >/dev/null
  (cd "$RUNNER_DIRECTORY" && ./svc.sh stop && ./svc.sh start && ./svc.sh status)
  exit 0
fi

RUNNER_METADATA=$(github api "repos/$REPOSITORY/actions/runners/downloads" \
  --jq '.[] | select(.os == "osx" and .architecture == "arm64") | [.filename, .sha256_checksum, .download_url] | @tsv')
IFS=$'\t' read -r RUNNER_FILENAME RUNNER_CHECKSUM RUNNER_URL <<<"$RUNNER_METADATA"
[[ "$RUNNER_FILENAME" =~ ^actions-runner-osx-arm64-[0-9.]+\.tar\.gz$ ]]
[[ "$RUNNER_CHECKSUM" =~ ^[a-f0-9]{64}$ ]]
[[ "$RUNNER_URL" == https://github.com/actions/runner/releases/download/* ]]
RUNNER_ARCHIVE="$RUNNER_ROOT/packages/$RUNNER_FILENAME"
if [ ! -f "$RUNNER_ARCHIVE" ]; then
  curl -fsSL --retry 3 --output "$RUNNER_ARCHIVE.new" "$RUNNER_URL"
  mv "$RUNNER_ARCHIVE.new" "$RUNNER_ARCHIVE"
fi
printf '%s  %s\n' "$RUNNER_CHECKSUM" "$RUNNER_ARCHIVE" | shasum -a 256 -c -
tar xzf "$RUNNER_ARCHIVE" -C "$RUNNER_DIRECTORY"
cd "$RUNNER_DIRECTORY"
RUNNER_TOKEN=$(github api --method POST "repos/$REPOSITORY/actions/runners/registration-token" --jq .token)
./config.sh --unattended --url "https://github.com/$REPOSITORY" --token "$RUNNER_TOKEN" \
  --name "dcarrell-mac-arm64-${REPOSITORY#*/}" --labels dcarrell-mac --work _work
unset RUNNER_TOKEN
cat > .env <<ENV
ACTIONS_RUNNER_HOOK_JOB_STARTED=$RUNNER_DIRECTORY/guard/runner-job-guard.sh
GH_CONFIG_DIR=$RUNNER_ROOT/config/$RUNNER_SLUG/gh
GIT_CONFIG_GLOBAL=$RUNNER_ROOT/config/$RUNNER_SLUG/gitconfig
DOCKER_CONFIG=$RUNNER_ROOT/config/$RUNNER_SLUG/docker
DOCKER_HOST=unix://$HOME/.docker/run/docker.sock
npm_config_fetch_timeout=300000
npm_config_network_concurrency=4
npm_config_store_dir=$RUNNER_ROOT/pnpm-store
PNPM_CONFIG_FETCH_TIMEOUT=300000
PNPM_CONFIG_NETWORK_CONCURRENCY=4
PNPM_CONFIG_STORE_DIR=$RUNNER_ROOT/pnpm-store
ENV
touch "$RUNNER_ROOT/config/$RUNNER_SLUG/gitconfig"
# An explicit empty helper prevents Docker from selecting the interactive Mac Keychain.
printf '%s\n' '{"cliPluginsExtraDirs":["/Applications/Docker.app/Contents/Resources/cli-plugins"],"credsStore":"","credHelpers":{"ghcr.io":""}}' > "$RUNNER_ROOT/config/$RUNNER_SLUG/docker/config.json"
printf '%s\n' "/opt/homebrew/opt/node@22/bin:/opt/homebrew/bin:$HOME/.local/bin:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin" > .path
chmod 600 .env .path .runner .credentials .credentials_rsaparams
./svc.sh install
./svc.sh start
