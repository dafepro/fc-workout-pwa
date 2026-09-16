#!/bin/sh
# Disposable fixture-only integration: no production credentials or cloud services.
set -eu
ROOT=$(CDPATH='' cd -- "$(dirname -- "$0")/.." && pwd)
cd "$ROOT"
node --input-type=module - <<'JS'
import { createServer } from "node:net";
for (const port of [19080,19090,8795,3005]) for (const host of ["127.0.0.1","::1"]) {
  await new Promise((resolve,reject)=>{
    const probe=createServer();
    probe.once("error",()=>reject(Error(`Local port ${port} is unavailable; stop its existing service before starting the fixture stack.`)));
    probe.listen(port,host,()=>probe.close(resolve));
  });
}
JS
RUN_DIR=$(mktemp -d "${TMPDIR:-/tmp}/zoomigo-world.XXXXXX")
API_PID=""
RELAY_PID=""
APP_PID=""
cleanup() {
  for child in "$APP_PID" "$RELAY_PID" "$API_PID"; do
    if [ -n "$child" ]; then kill "$child" 2>/dev/null || true; fi
  done
  for child in "$APP_PID" "$RELAY_PID" "$API_PID"; do
    if [ -n "$child" ]; then wait "$child" 2>/dev/null || true; fi
  done
  rm -rf "$RUN_DIR"
}
trap cleanup EXIT HUP INT TERM
export TEAM_WORLD_RELAY_KEY=local-team-world-integration-key-only
export TEAM_WORLD_RELAY_URL=ws://127.0.0.1:8795/room
export TEAM_WORLD_ALLOWED_ORIGIN=http://localhost:3005
export TEAM_WORLD_API_URL=http://127.0.0.1:19080
export ZOOMIGO_API_BASE_URL=$TEAM_WORLD_API_URL
export ZOOMIGO_BUILD_PROFILE=development
export APP_ENV=e2e ENABLE_E2E_FIXTURES=true
export E2E_RESET_KEY=local-team-world-e2e-only
export DATABASE_URL="file:$RUN_DIR/world.db"
export PORT=19080 METRICS_PORT=19090
export ALLOWED_ORIGIN=$TEAM_WORLD_ALLOWED_ORIGIN
export LOGIN_ATTEMPTS_PER_MINUTE=0 GLOBAL_LOGIN_ATTEMPTS_PER_MINUTE=0
(cd backend && go build -tags=e2e -o "$RUN_DIR/api" ./cmd/api)
node scripts/prepare-team-world.mjs
"$RUN_DIR/api" & API_PID=$!
tries=0
until curl --fail --silent "$TEAM_WORLD_API_URL/readyz" >/dev/null; do
  tries=$((tries + 1))
  if [ "$tries" -ge 100 ] || ! kill -0 "$API_PID" 2>/dev/null; then
    printf '%s\n' "Fixture API did not start; check that ports 19080 and 19090 are free." >&2
    exit 1
  fi
  sleep 0.2
done
node services/team-world/server.mjs & RELAY_PID=$!
./node_modules/.bin/vinext dev --port 3005 & APP_PID=$!
printf '%s\n' "Team World: http://localhost:3005/team-world (fixture sign-in documented in docs/TEAM_WORLD.md)"
wait "$APP_PID"
