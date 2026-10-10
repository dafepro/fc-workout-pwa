#!/bin/bash
set -eu
exec /opt/homebrew/opt/node@22/bin/node "$(dirname "$0")/runner-job-guard.mjs"
