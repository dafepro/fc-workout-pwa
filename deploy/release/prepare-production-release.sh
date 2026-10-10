#!/bin/sh

set -eu

SCRIPT_DIRECTORY=$(CDPATH='' cd -- "$(dirname -- "$0")" && pwd)
REPOSITORY_ROOT=$(CDPATH='' cd -- "$SCRIPT_DIRECTORY/../.." && pwd)
release_sha=${1:?usage: prepare-production-release.sh RELEASE_SHA OUTPUT_DIRECTORY}
output_directory=${2:?usage: prepare-production-release.sh RELEASE_SHA OUTPUT_DIRECTORY}
cd "$REPOSITORY_ROOT"
[ "$(git rev-parse HEAD)" = "$release_sha" ] || { printf '%s\n' "error: release SHA is not the checked-out commit" >&2; exit 1; }
[ -z "$(git status --porcelain --untracked-files=no)" ] || { printf '%s\n' "error: refusing to package a dirty worktree" >&2; exit 1; }
ZOOMIGO_BUILD_PROFILE=production ./scripts/verify.sh
mkdir -p "$output_directory"
output_directory=$(CDPATH='' cd -- "$output_directory" && pwd)
tar -czf "$output_directory/worker.tgz" dist drizzle
API_DIGEST=$(docker buildx imagetools inspect \
	--format '{{json .Manifest}}' "ghcr.io/dafepro/fc-workout-pwa/api:sha-$release_sha" |
	node -e 'let s="";process.stdin.on("data",c=>s+=c);process.stdin.on("end",()=>process.stdout.write(JSON.parse(s).digest))')
CONTROLLER_SHA=$release_sha
export API_DIGEST CONTROLLER_SHA
node scripts/artifact-provenance.mjs create production "$release_sha" \
	"$output_directory/worker.tgz" "$output_directory/release-manifest.json"
printf '%s\n' "Prepared verified production artifacts in $output_directory. Load deployment credentials only after this step."
