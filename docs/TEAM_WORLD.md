# Team World v3

**Status:** Maintained — development campus; not pilot-qualified.

## What is implemented

`/team-world` lazily loads zmap 0.1.5 and Avatar Studio 0.1.2 from pinned GitHub
Release tarballs (ZMap 0.1.5 is a development preview). The development Team hub exposes a Team World link after the
existing check-in gate. Production navigation is unchanged during qualification.

The textured team campus includes two pitches, furnished terraces, ramps and a
bridge/underpass. Its app-owned Blender sources produce the same terrain and
solid furniture envelopes used by the client and relay. The campus preserves the cannon, shared balls, three
field tools, click/tap paths, joystick, keyboard movement, sprint, emotes and
draw/stow. The three reviewed example appearances are selected server-side by a
stable player-ID hash. This is not yet a saved modular appearance editor.

See [campus ownership and follow-ups](TEAM_WORLD_CAMPUS_TODO.md) for the current
package split, map extent, remaining view/navigation design work and rollout
constraints. [Campus provenance](../assets/team-world/campus/PROVENANCE.md)
records reused CC0 models, generated texture prompts and the Blender rebuild.

Architecture stays opaque and intact. Occluded character fragments render as a
muted grey silhouette with a fine cream rim. Depth and stencil tests preserve
visible body colors and prevent the overlay from showing through the character
itself. Overlays live outside Avatar Studio's asset tree so cosmetic passes do
not consume its equipment budget. No geometry is cut away.

Each existing pitch has a classic paneled soccer ball and Burgundy/Gold goals.
The positive-X goal awards Burgundy; the negative-X goal awards Gold. A whole
ball crossing between the posts and under the bar counts once. It stays in the
goal for one second, dissolves over half a second, then teleports and fades in
at midfield over 0.6 seconds. Reduced motion uses visibility changes. Ball-only
pitch boundaries preserve player movement; out-of-bounds kicks, tools and pair
contacts are corrected before a simulation tick is published. Goal pockets are
part of the playable enclosure. Physical boards and an accessible HUD show the
nearest pitch's shared score. Scores are transient, saturate at 999999 and reset
when the room empties, with no training credit or individual ranking.

This adapts Canvas's accepted-ball, capture-once, hold-and-score pattern. The
ZMap app behavior replaces Canvas's eject impulse with the requested midfield
reset. The reusable ZMap `afterStep` hook supplies settled physics; all soccer
policy remains in `app/team-world/soccer.mjs`, installed identically in both peers
and the relay. The existing practice ball becomes the main-pitch ball, keeping
the five-toy budget, with one additional garden-pitch ball.

`app/team-world/adapters/` owns the mapping from accepted world actions to avatar
and cannon presentation and pointer controls. It imports public packages; no
runtime engine or avatar source is forked. Approved asset provenance is in
`assets/team-world/PROVENANCE.md`. `scripts/prepare-team-world.mjs` copies only the
installed runtime assets to a versioned public path before dev/build.

## Viewport and controls

The world uses a tall playfield with floating Lounge-style status, presence and
fullscreen controls. The bottom dock opens one movement/camera, equipment or
expression panel at a time. An equipped tool has a separate hold-to-use button;
closing a panel leaves the scene available for click/tap paths or the joystick.
The shared fullscreen hook supports native fullscreen, viewport expansion,
Escape/exit, body-scroll restoration and route cleanup. Insets respect phone
safe areas; controls retain 44px touch targets at 320px widths.

Rendering keeps the existing meshes, ink materials, MSAA and simulation cadence.
The app caps its drawing buffer at 1.5 million pixels (up to the existing 1.5×
device ratio), including after fullscreen/resizing. Comic-style bindings refresh
when equipment roots or buffer dimensions change, rather than rescanning each
avatar hierarchy every displayed frame. Sprint UI writes occur only on state
changes, and control readiness no longer builds full avatar diagnostic reports.

A local Chrome comparison at 1440×900 CSS pixels, device ratio 2, measured
2,916,000 → 1,499,432 drawing-buffer pixels and 482 → 0 idle dock DOM mutations
over four seconds. Both runs displayed 240 frames, with p95 16.7ms. This reduces
work; it is not evidence of higher FPS or qualification on slower GPUs/phones.

Joystick is the default on entry and retry. Press an open canvas location to
anchor a floating stick there; release hides it. The 30px inner ring reaches
walking speed, and the next 10px band accelerates to sprint. Returning inside
slows back to walking. Quick taps still activate nearby items, while dragging
never activates one. UI controls do not start a joystick. The always-available
Kick ball button and Space kick nearby balls.

In optional path mode, tap a nearby destination to walk; longer routes gradually accelerate toward a
sprint and slow before arrival. Hold on the ground for at least 160ms to steer
toward the moving cursor; release a hold to stop. Quick taps retain their route.
The joystick uses its inner range for walking and outer range for sprinting.
`Pace · walk only` caps either mode. WASD/arrow keys and Shift remain available;
keyboard movement, blur, pointer cancellation and mode changes cancel steering.

Approved nearby objects expose state-dependent buttons and direct model taps.
The courtyard lamp uses Kenney's CC0 Furniture Kit `lampSquareFloor.glb`, bundled
with its original license in `assets/team-world/kenney/`. It drives a real
point light, emissive shade and depth-tested ground pool. The switch is shared
transient room state, including late joins and host handoff; the nine-tick
switch debounce also disables the button briefly. The app supplies the model,
labels and picking; zmap 0.1.5 owns sequenced commands, approved actions, distance,
line-of-sight and movement-lock checks. Both relay and browser install the same
behavior and require the interaction protocol capability.

Avatar Studio 0.1.2 corrects the early ink pass to write depth. A real WebGL
regression first reproduced disappearing silhouettes behind opaque scenery,
then verified retained ink, foreground occlusion and clean repeated redraws.
This addresses an overlap defect, not a claim that every display's motion
smearing has been reproduced or eliminated.

## Authority and deployment boundary

Browser and isolated relay manifests must pin the same ZMap tarball and
integrity. `test:world` enforces that contract; the dev pipeline also starts the
published relay image and checks its health before touching the droplet. This
catches missing exports or map/behavior incompatibility in the actual container.

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
restart/rollback qualification remains open. Dev uses the gated same-origin
WebSocket topology described in `DEV_ENVIRONMENT.md`.

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

The September 16 interaction pass passed all 531 app tests, eight relay tests,
eight connected Chrome journeys, lint, types, formatting and static deployment/
documentation contracts. The browser journeys include floating-stick relocation,
walk/sprint thresholds, a real kick scoring for both peers, and midfield return.
Visual review checked the football/scoreboard and grey under-bridge silhouette
against the generated reference, with normal color above the bridge and no box
cutaway. ZMap's generic after-physics extension passed 49 focused engine tests.
The Worker build/upload dry run was 2241.74 KiB compressed against its
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
4. Qualify restart, disable/rollback and one-writer behavior beyond the dev
   topology documented in `DEV_ENVIRONMENT.md`. Production remains unchanged.
5. Measure representative phone rendering, input/recovery percentiles, room load
   and cost. No physical-device qualification is claimed.

## Earlier dev deployment evidence

The earlier dev verification used application `ab5d47cd676120fab500146ec5e2ee199fdeec83`, which includes
the previously deployed baseline `7853c13a4e2c6c15fe6a27e1bb7a3f1ad32cc437`.
The update preserved the database and skipped fixture reset. The
[deployment run](https://github.com/dafepro/fc-workout-pwa/actions/runs/35049549374)
passed build, strict package-integrity policy, API tests in both build modes,
Caddy validation, relay health, exact API revision and the existing Canvas
Lounge browser proof. Production was not deployed.

The new public two-player test passed against that same deployment in local
Chrome (18.9 seconds), including gated sign-in, qualified entry, peer movement,
equipment, shared expression and departure. Its Linux CI run reached both players but
failed the movement assertion (0.293 units versus the required >0.3 within
15 seconds), so the aggregate workflow is **failed**, despite the successful
deployment. This remains an open browser qualification issue;
the local pass does not establish Linux or phone performance. No assertion or
runtime stall threshold was relaxed.

For manual review, open <https://dev.zoomigo.quicktrack.cc/team-world>, enter the
shared preview password, choose a fixture player, and use PIN `1111`. Log an
activity to satisfy the existing participation gate, then open **Team → Team
World**. Use another browser profile for a second player.

## Scheduling update for dev evaluation

The earlier scheduling evaluation pinned zmap 0.1.3 in both the browser and relay. Simulation
advances on an independent 30 Hz timer; rendering uses that clock for smooth
interpolation and stops during recovery from a main-thread stall. The runtime
retains its existing eligibility thresholds and requires no database migration.

Upstream validation passes 111 unit/socket tests, the independent package
consumer, three local Chrome synchronization journeys, and a three-player
action journey. Linux software rendering remains under qualification; these
changes are a dev evaluation update rather than a claim of pilot readiness.
