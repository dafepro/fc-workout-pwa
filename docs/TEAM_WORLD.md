# Team World v3

**Status:** Maintained — connected first playable on the integration branch;
not deployed or pilot-qualified.

## What is implemented

`/team-world` lazily loads zmap 0.1.2 and Avatar Studio 0.1.1 from pinned GitHub
Release tarballs. The development Team hub exposes a Team World link after the
existing check-in gate. Production navigation is unchanged during qualification.

The approved Fieldwork courtyard includes the cannon, shared balls, three
field tools, click/tap paths, joystick, keyboard movement, sprint, emotes and
draw/stow. The three reviewed example appearances are selected server-side by a
stable player-ID hash. This is not yet a saved modular appearance editor.

`app/team-world/adapters/` owns the mapping from accepted world actions to avatar
and cannon presentation and pointer controls. It imports public packages; no
runtime engine or avatar source is forked. Approved asset provenance is in
`assets/team-world/PROVENANCE.md`. `scripts/prepare-team-world.mjs` copies only the
installed runtime assets to a versioned public path before dev/build.

## Authority and deployment boundary

The frontend remains Vinext/Cloudflare. `services/team-world/server.mjs` is a
separate Node relay; `zmap/server` is never imported by a Worker or browser route.
The Go API owns real sessions, membership and post-check-in policy. Its one-use
30-second tickets and relay-only continuing-access grants are described in the
[API inventory](backend/API.md). Each grant remains bound to the original
session and room. The relay rechecks current policy at least once per second
while active and never publishes the private grant or session credential.

World rooms use `world-v3-<SHA-256(team ID)>`: a stable, bounded zmap-compatible
identifier, distinct from Canvas rooms. The browser checks the ticket's requested
team and endpoint before entry/reconnection. The same-origin browser proxy
exposes only ticket issuance, not internal relay authority routes.

This slice has no durable layout edits. The map has no placement zones, the
relay rejects commits, and no UI promises a saved placement. A transactional v3
store and entitlement policy are required before enabling decorating. No Canvas
state is converted, shared, dual-written or selected as a fallback.

Run one API writer and one relay. API restart invalidates ephemeral grants;
relay restart drops transient rooms. Normal socket reconnect obtains fresh
credentials; terminal access denial presents an explicit retry. Production
restart/rollback qualification and deployed TLS/origin configuration remain open.

## Run the isolated local integration

Requires Go 1.26+, Node 22.13+ and the repository's pnpm dependencies. No cloud
credentials or production data are used.

```sh
pnpm install --frozen-lockfile
pnpm dev:team-world
```

The script starts a fixture-only Go API with real SQLite migrations on 19080,
metrics on 19090, the relay on 8795, and the app on localhost:3005. It creates a
disposable database and terminates its own children when stopped. Free these
ports first. Do not expose this fixture topology on a public host.

Fixture sign-in, using the existing E2E identities:

- Mason: `/login?e2e=1#credential=AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA`, PIN `2468`.
- Ava: `/login?e2e=1#credential=BBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBB`, PIN `1357`.

Open `/team-world` after signing in. Use separate browser profiles/contexts for
two accounts. The fixture API grants no access to real accounts or production.

Targeted browser coverage, while the local script is running:

```sh
E2E_TEAM_WORLD=1 \
E2E_BROWSER_CHANNEL=chrome \
E2E_API_BASE_URL=http://127.0.0.1:19080 \
E2E_PWA_BASE_URL=http://localhost:3005 \
E2E_RESET_KEY=local-team-world-e2e-only \
pnpm test:browser e2e/pwa-team-world.spec.ts
```

Omit the browser-channel override if Playwright Chromium is installed. The new
suite is skipped unless explicitly enabled because the ordinary app E2E topology
has no v3 relay. It resets only the fixture database identified by the local API
and reset key. Do not run it against a shared development session.

`backend/compose.team-world.yaml` overlays the existing E2E API container with
these ports and fixture settings. Run only `api` with both compose files, then
start the host relay/PWA with the corresponding environment variables instead
of starting a second API. The Docker image build could not be validated in this
pass because Docker Hub metadata retrieval timed out; the native API exercised
the same real migrations/authentication.

## Verification and remaining gates

The connected browser tests passed with two real fixture accounts: entry,
peer-visible movement, equipment, shared emote, 320px layout, route disposal and
original-session revocation within five seconds. No socket or identity was
mocked. The relay adapter also has a local HTTP contract test. The Go
HTTP/configuration suites and vet passed, including ticket scope/replay/expiry,
locked/cross-team access, session and membership revocation, replacement grants
and fail-closed configuration.

The app's 518 tests, lint, types and static deployment/documentation contracts
passed. The Worker build/upload dry run was 2233 KiB compressed against its
2800 KiB budget; the world remains a lazy browser bundle. Desktop browser tests
do not establish physical-phone performance.

Continue with these active integration gates before a pilot:

1. Resolve upstream software-rendered Linux world/animation qualification. The
   no-host election storm is fixed in zmap 0.1.2; that alone does not resolve all
   rendering stalls. See zmap's `docs/ci-browser-investigation.md`.
2. Add a versioned saved v3 recipe contract, approved modular editor and
   entitlement validation. Existing Canvas appearance JSON is not that contract.
3. Implement transactional layout/CAS/idempotency receipts and approved inventory
   mapping before exposing decorating.
4. Wire and qualify the deployed relay/backend TLS, service supervision, restart,
   disable/rollback and one-writer policy. No production configuration changed.
5. Measure representative phone rendering, input/recovery percentiles, room load
   and cost. No physical-device qualification is claimed.
