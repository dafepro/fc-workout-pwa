#!/bin/sh

set -eu

SCRIPT_DIRECTORY=$(CDPATH='' cd -- "$(dirname -- "$0")" && pwd)
REPOSITORY_ROOT=$(CDPATH='' cd -- "$SCRIPT_DIRECTORY/.." && pwd)
RUN_E2E=false

case ${1:-} in
	"") ;;
	--all) RUN_E2E=true ;;
	*) printf '%s\n' "usage: ./scripts/verify.sh [--all]" >&2; exit 1 ;;
esac

for command_name in go node pnpm tofu; do
	command -v "$command_name" >/dev/null 2>&1 || {
		printf '%s\n' "error: $command_name is required" >&2
		exit 1
	}
done

cd "$REPOSITORY_ROOT"
pnpm install --frozen-lockfile
pnpm format
pnpm lint
pnpm typecheck
pnpm test
pnpm build

cd "$REPOSITORY_ROOT/backend"
unformatted=$(gofmt -l .)
[ -z "$unformatted" ] || {
	printf '%s\n' "error: gofmt is required for:" "$unformatted" >&2
	exit 1
}
go vet ./...
go test ./...

cd "$REPOSITORY_ROOT"
node scripts/contracts.mjs
node --test scripts/unix-automation-contract.test.mjs
node --test scripts/deploy-dev.test.mjs
node --test deploy/observability/config_test.mjs scripts/observability-query.test.mjs

cd "$REPOSITORY_ROOT/infra/digitalocean"
tofu fmt -check
tofu init -backend=false -input=false
tofu validate

if [ "$RUN_E2E" = true ]; then
	"$SCRIPT_DIRECTORY/e2e.sh"
	"$SCRIPT_DIRECTORY/vm-smoke.sh"
fi

printf '%s\n' "ZoomiGo local verification passed."
