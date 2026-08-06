#!/bin/sh

set -eu

SCRIPT_DIRECTORY=$(CDPATH='' cd -- "$(dirname -- "$0")" && pwd)
REPOSITORY_ROOT=$(CDPATH='' cd -- "$SCRIPT_DIRECTORY/../.." && pwd)
release_sha=${1:?usage: publish-image.sh RELEASE_SHA}
image_repository=${API_IMAGE_REPOSITORY:-ghcr.io/dafepro/fc-workout-pwa/api}

for command_name in docker git; do
	command -v "$command_name" >/dev/null 2>&1 || {
		printf '%s\n' "error: $command_name is required" >&2
		exit 1
	}
done
case "$release_sha" in *[!0-9a-f]*|"") printf '%s\n' "error: invalid release SHA" >&2; exit 1 ;; esac
[ "${#release_sha}" -eq 40 ] || { printf '%s\n' "error: invalid release SHA" >&2; exit 1; }

cd "$REPOSITORY_ROOT"
[ "$(git rev-parse HEAD)" = "$release_sha" ] || {
	printf '%s\n' "error: release SHA is not the checked-out commit" >&2
	exit 1
}
[ -z "$(git status --porcelain)" ] || {
	printf '%s\n' "error: refusing to publish from a dirty worktree" >&2
	exit 1
}

docker buildx build \
	--file backend/Dockerfile \
	--platform linux/amd64 \
	--build-arg "APP_VERSION=$release_sha" \
	--tag "$image_repository:sha-$release_sha" \
	--provenance=mode=max \
	--sbom=true \
	--push \
	backend

printf '%s\n' "Published immutable API image $image_repository:sha-$release_sha."
