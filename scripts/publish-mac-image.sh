#!/bin/bash
set -euo pipefail
umask 077

: "${RUNNER_TEMP:?}"
: "${GITHUB_SHA:?}"
: "${GITHUB_ACTOR:?}"
: "${GHCR_TOKEN:?}"
: "${EXPECTED_IMAGE_DIGEST:?}"
: "${GITHUB_OUTPUT:?}"
[[ ${GITHUB_REPOSITORY:-} == dafepro/fc-workout-pwa && ${GITHUB_REF:-} == refs/heads/main ]]
[[ $GITHUB_SHA =~ ^[0-9a-f]{40}$ && $GITHUB_ACTOR =~ ^[A-Za-z0-9-]+$ ]]

archive=${1:?OCI image archive required}
work=$(mktemp -d "$RUNNER_TEMP/ghcr.XXXXXX")
trap 'rm -rf -- "$work"' EXIT
regctl="$work/regctl"
transport="$(dirname "$0")/mac-artifact-connect.py"
python3 "$transport" downloads curl -fLsS --retry 2 --max-time 90 \
  https://github.com/regclient/regclient/releases/download/v0.11.7/regctl-darwin-arm64 \
  -o "$regctl"
printf '%s  %s\n' 8ac077a1eeb834d3053714e86ccbd838d0da46567df8cd7c2695d1a19135bf60 "$regctl" |
  shasum -a 256 -c >/dev/null
chmod 700 "$regctl"

export REGCTL_CONFIG="$work/config.json"
# Keep authentication and pushes on the same private, TLS-transparent route.
python3 "$transport" registry /bin/bash -eu -o pipefail -c '
  regctl=$1
  archive=$2
  image="ghcr.io/dafepro/fc-workout-pwa/api"
  version="$image:sha-$GITHUB_SHA"
  printf "%s\n" "$GHCR_TOKEN" | "$regctl" registry login ghcr.io --user "$GITHUB_ACTOR" --pass-stdin
  unset GHCR_TOKEN
  "$regctl" image import "$version" "$archive"
  digest=$("$regctl" manifest digest "$version")
  if [[ ! $digest =~ ^sha256:[0-9a-f]{64}$ || $digest != "$EXPECTED_IMAGE_DIGEST" ]]; then
    echo "GHCR digest does not match the Mac build." >&2
    exit 1
  fi
  "$regctl" image copy "$image@$digest" "$image:main"
  [[ $("$regctl" manifest digest "$image:main") == "$digest" ]]
  printf "digest=%s\n" "$digest" >> "$GITHUB_OUTPUT"
' _ "$regctl" "$archive"
