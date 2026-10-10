#!/bin/bash
set -eu
umask 077

SCRIPT_DIRECTORY=$(CDPATH='' cd -- "$(dirname -- "$0")" && pwd)
RUNNER_ROOT="$HOME/.local/share/github-mac-runners"
REPOSITORY=${1:-}
github() {
  GH_TOKEN="$(gh auth token -h github.com -u dafepro)" gh "$@"
}

if [ "$REPOSITORY" = '--all' ]; then
  github repo list dafepro --limit 1000 --json nameWithOwner,isArchived,isFork \
    --jq '.[] | select(.isArchived == false and .isFork == false) | .nameWithOwner' |
    while IFS= read -r runner_repository; do
      "$0" "$runner_repository"
   done
  exit 0
fi
if ! [[ "$REPOSITORY" =~ ^dafepro/[a-zA-Z0-9_.-]+$ ]]; then
  echo 'usage: github-mac-runner dafepro/REPOSITORY | --all' >&2
  exit 1
fi
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
if [ "$REPOSITORY" = 'dafepro/fc-workout-pwa' ] &&
   [ -f "$HOME/.local/share/zoomigo-actions-runner/.runner" ]; then
  RUNNER_DIRECTORY="$HOME/.local/share/zoomigo-actions-runner"
fi
if [ -f "$RUNNER_DIRECTORY/.runner" ]; then
  RUNNER_ID=$(jq -r .agentId "$RUNNER_DIRECTORY/.runner")
  github api --method POST "repos/$REPOSITORY/actions/runners/$RUNNER_ID/labels" \
    -f 'labels[]=dcarrell-mac' >/dev/null
  (cd "$RUNNER_DIRECTORY" && ./svc.sh status)
  exit 0
fi

mkdir -p "$RUNNER_ROOT/packages" "$RUNNER_ROOT/guard" "$RUNNER_ROOT/config/$RUNNER_SLUG/docker" \
  "$RUNNER_ROOT/config/$RUNNER_SLUG/gh" "$RUNNER_ROOT/pnpm-store" "$RUNNER_DIRECTORY"
chmod 700 "$RUNNER_ROOT" "$RUNNER_DIRECTORY"
for guard_file in runner-job-guard.sh runner-job-guard.mjs; do
  cp "$SCRIPT_DIRECTORY/$guard_file" "$RUNNER_ROOT/guard/$guard_file.new"
  mv "$RUNNER_ROOT/guard/$guard_file.new" "$RUNNER_ROOT/guard/$guard_file"
done
chmod 700 "$RUNNER_ROOT/guard/runner-job-guard.sh"
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
ACTIONS_RUNNER_HOOK_JOB_STARTED=$RUNNER_ROOT/guard/runner-job-guard.sh
GH_CONFIG_DIR=$RUNNER_ROOT/config/$RUNNER_SLUG/gh
GIT_CONFIG_GLOBAL=$RUNNER_ROOT/config/$RUNNER_SLUG/gitconfig
DOCKER_CONFIG=$RUNNER_ROOT/config/$RUNNER_SLUG/docker
DOCKER_HOST=unix://$HOME/.docker/run/docker.sock
npm_config_fetch_timeout=300000
npm_config_network_concurrency=4
npm_config_store_dir=$RUNNER_ROOT/pnpm-store
ENV
touch "$RUNNER_ROOT/config/$RUNNER_SLUG/gitconfig"
printf '%s\n' '{"cliPluginsExtraDirs":["/Applications/Docker.app/Contents/Resources/cli-plugins"]}' > "$RUNNER_ROOT/config/$RUNNER_SLUG/docker/config.json"
printf '%s\n' "/opt/homebrew/opt/node@22/bin:/opt/homebrew/bin:$HOME/.local/bin:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin" > .path
chmod 600 .env .path .runner .credentials .credentials_rsaparams
./svc.sh install
./svc.sh start
