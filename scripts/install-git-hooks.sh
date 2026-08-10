#!/bin/sh

# Points this clone at the versioned hooks in scripts/git-hooks.

set -eu

SCRIPT_DIRECTORY=$(CDPATH='' cd -- "$(dirname -- "$0")" && pwd)
REPOSITORY_ROOT=$(CDPATH='' cd -- "$SCRIPT_DIRECTORY/.." && pwd)

cd "$REPOSITORY_ROOT"
chmod +x scripts/git-hooks/*
git config core.hooksPath scripts/git-hooks

printf '%s\n' "Git hooks installed from scripts/git-hooks."
