# Team World v3

**Status:** Maintained — development campus; not pilot-qualified.

## What is implemented

Both pitch balls have a soft noon shadow directly below their displayed center.
The shadow follows the highest supporting surface beneath the ball, stays on
the floor under a bridge, grows and softens with height, and follows goal
dissolve/return visibility. It is a ground projection of the current position,
not a prediction of the future landing point. No shadow-map pass is required.

Avatar Studio's independent Court collection supplies six new reference-modeled
parts. Burgundy wears the Matchday sash jersey, shorts and sports glasses;
Sage wears the Courtside zip top, longer shorts and open visor. Saffron wears the
Playtime trio: Frog Days bucket hat, Bolt Mode lightning frames and Melon Club
watermelon jersey. Each playful part is independently selectable in Avatar
Studio. Appearance IDs and server policy are unchanged. Assets use
the immutable `/team-world-assets/v0.1.4/` path to avoid stale catalog/model
combinations. Source references, editable Blender geometry and fitted browser
turnarounds live in the avatar repository.

`/team-world` lazily loads zmap 0.1.11 and Avatar Studio 0.1.4 from pinned GitHub
Release tarballs. The development Team hub exposes a Team World link after the
existing check-in gate. Production navigation is unchanged during qualification.

The textured team campus includes two pitches, furnished terraces, ramps and a
bridge/underpass. Its app-owned Blender sources produce the same terrain and
solid furniture envelopes used by the client and relay. The campus preserves the cannon, shared balls, three
field tools, click/tap paths, joystick, keyboard movement, sprint, emotes and
draw/stow. The three reviewed example appearances are selected server-side by a
stable player-ID hash. This is not yet a saved modular appearance editor.
The entry screen shows the saved portrait and explains the separate 3D outfit.
The portrait editor states the same boundary; see the
[representation decision](PWA_EXPERIENCE.md#rewards-and-identity).

See [campus ownership and follow-ups](TEAM_WORLD_CAMPUS_TODO.md) for the current
package split, map extent, remaining view/navigation design work and rollout
constraints. [Campus provenance](../assets/team-world/campus/PROVENANCE.md)
records reused CC0 models, generated texture prompts and the Blender rebuild.

Architecture stays opaque and intact. The renderer flattens original avatar
geometry into a nearest-surface depth mask, compares it with a separate terrain
mask, then composites one flat grey silhouette with a cream boundary. Visible
body pixels are unchanged, and overlapping parts are shaded exactly once. No
per-part ghost geometry, source-material mutation or rectangular cutaway remains.
Both masks follow the drawing-buffer budget and are released on route exit.
A real WebGL pixel regression checks unobstructed/moving, fully hidden and partly
hidden cases (`E2E_CAMPUS_REVIEW=1`, with the local Vite review server on port 3006).

Each existing pitch has a classic paneled soccer ball and Burgundy/Gold goals.
The positive-X goal awards Burgundy; the negative-X goal awards Gold. A whole
ball crossing between the posts and under the bar counts once. It stays in the
goal for one second, dissolves over half a second, then teleports and fades in
at midfield over 0.6 seconds. Reduced motion uses visibility changes. Ball-only
pitch boundaries preserve player movement; out-of-bounds kicks, tools and pair
contacts are corrected before a simulation tick is published. Goal pockets are
part of the playable enclosure. Separate Blender goal and scoreboard models are components of each shared pitch
object. Goal frames and scoreboard supports have authored physical boundaries;
net cages react to accepted goals. Thick freestanding boards use modeled,
instanced seven-segment digits that update from accepted pitch state. The
accessible HUD shows the nearest pitch's shared score. Campus and pitch models
ship under the manifest's digest directory, while map ID remains `team-world-campus-v2`. Scores are transient, saturate at 999999 and reset
when the room empties, with no training credit or individual ranking.

This adapts Canvas's accepted-ball, capture-once, hold-and-score pattern. The
Zoomap app behavior replaces Canvas's eject impulse with the requested midfield
reset. The reusable Zoomap `afterStep` hook supplies settled physics; all soccer
policy remains in `app/team-world/soccer.mjs`, installed identically in both peers
and the relay. The existing practice ball becomes the main-pitch ball, keeping
the five-toy budget, with one additional garden-pitch ball.

Both pitch balls use contextual strikes. Their distant 6.1 m/s grounded shot is
slower than the previous 8 m/s kick, their bounce is 0.5, and their ground
resistance is 1.0 m/s² so players can reach a rolling ball while a midfield shot
can still reach the far goal. Contact within 0.65 m lifts the ball at 8.4 m/s
vertically, but travels at just 2.8 m/s horizontally. Its 5.4 m/s² gravity
puts the centre above 6 m and keeps it airborne for roughly three seconds; a
second player can run under its descent and time a header. By 1.3 m, a strike
runs almost along the ground. Other toys retain their previous gravity.
At the 0.2-second shared contact tick, the actual ball height and reach select
a grounded kick, header, bicycle kick, or miss. Airborne attempts commit a real
0.44 m or 0.69 m jump when pressed, then validate ball position, contact point
and blockers at impact. The shared strike record supplies the dynamic world-space
head or boot target to the authored full-body animation. The header loads the
chest, rises, drives the forehead through contact and absorbs a staggered landing.
The bicycle turns away from the shot, exchanges the legs, strikes through an
overhead arc, lands on the back/side and rolls into a crouched get-up. Its boot
travels in the outgoing ball direction at impact. Header recovery lasts 0.92 s;
bicycle recovery lasts 1.16 s, while steering and the shared 0.2 s contact remain
unchanged. Reduced motion retains the physical jump and omits the authored pose.

Development-only **Dev controls** expose pitch-ball gravity, horizontal travel
speed, and rolling friction. Only the elected browser host can move the sliders;
changes apply to both pitch balls in the shared room for that visit. Losing the
host role or reconnecting restores authored defaults. The speed slider scales
close and distant horizontal travel together; vertical lift stays at 8.4 m/s.

`adapters/aerial-kick.ts` owns the app-authored key poses. Bounded Hermite curves
preserve momentum through contact. Contact fitting evaluates the impact pose
against the shared sphere-centre target, then eases a bounded local offset into
the animation; it does not chase the swinging foot. Visible rigid skin geometry
fits the landing to the current supporting surface, including raised terrain.
The animation uses Avatar Studio's public bones; no package source is copied.
See [aerial reference provenance](../assets/team-world/aerial-study-v1/PROVENANCE.md).

The local `tools/team-world/motion-review.html` review offers strike selection,
front/side/rear cameras, slow playback, a frame scrubber and multi-angle contact
sheets. `?strike=bicycle&simulation=1&moving=1` drives the real shared simulation;
`appearance=saffron` and `floor=2` exercise different geometry and raised surfaces.
The motion E2E suite checks both outgoing strike direction and contact distance,
floor clearance, recovery, moving strikes, reduced motion and the existing instep.

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
anchor a floating stick there; release hides it. The 60px inner radius reaches
walking speed, and the next 20px band accelerates to sprint. Returning inside
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

The current Avatar Studio ink pass writes depth. A real WebGL
regression first reproduced disappearing silhouettes behind opaque scenery,
then verified retained ink, foreground occlusion and clean repeated redraws.
This addresses an overlap defect, not a claim that every display's motion
smearing has been reproduced or eliminated.

## Authority and deployment boundary

Browser and isolated relay manifests must pin the same Zoomap tarball and
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

For built Worker/static-asset qualification instead of development module
streaming, use the same disposable stack:

```sh
pnpm dev:team-world --built
```

This builds the development profile once and runs Wrangler locally with
disposable persistence and analytics disabled. It still does not qualify Docker,
VM deployment, HTTPS installation or a physical device. Avoid rebuilding while
browser checks are running; Wrangler watches the generated output.

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

`backend/compose.world-e2e.yaml` supplies the automated local relay overlay.
`backend/compose.team-world.yaml` remains available for a host relay/PWA with only
its API running in Docker; do not start a second API on the same ports.

## Verification and remaining gates

Normal `pnpm verify` runs `test:world` and standalone Node contracts as well as
application/Go/static/build checks. `pnpm test:e2e:world` builds a wholly local
API/PWA/relay/browser topology and rejects empty, skipped, flaky or failed World
reports. `pnpm verify --all` adds ordinary Docker E2E, World and VM smoke. None uses
cloud secrets or shared dev data. The native commands above are useful targeted
qualification when Docker image retrieval is unavailable; they do not prove the
container or VM deployment.

The October candidate passes all 14 original native local World browser cases
with zero skips/retries, covering gameplay, controls, diagnostics, session
revocation, connection loss/retry and route disposal. Final built Worker
qualification also includes four required-art lifecycle cases, core recovery,
team context, repeat rewards and campus visual loading. An initial dev-server HMR context failure
cleared after restart. The full run then exposed a soccer-test destination outside
the visible canvas; an explicit bounds assertion reproduced it and a nearby
waypoint retained scoring/synchronization assertions. Docker/VM/live-dev/device
qualification remains open; native success does not replace those gates.
Desktop Chrome, a Worker upload-size pass and relay health are not evidence of
physical-phone performance or authority connectivity.

An October native Chrome 154/M4 Pro probe completed 20 entry/exit cycles with
one live room socket and none after each exit, no page errors, and usable
training afterward. Three entries requested cold HTTP cache; service-worker
responses later invalidated the original wire/throttling inference. Corrected
cache and service-worker bypass measured 11.47 MB of first-entry assets, including
an 8.81 MB campus. Its opaque texture derivatives now reduce the campus to
2.08 MB and measured asset transfer to 4.73 MB while preserving exact geometry,
materials and collision data. Close/overview/320px views were inspected. A
corrected 5 Mbps/80 ms development-server run stayed in Joining past 30 seconds;
the many development modules make this an unsuitable production-network gate.
Physical phones, full room and GPU-memory evidence remain required. Frame samples and socket cleanup alone do not prove GPU disposal.

Built development-profile Worker probes on local Chrome 154.0.8037.98/M4 Pro
used a 1440×900 viewport at DPR 1, a pre-authenticated direct World navigation,
service workers blocked/bypassed, and CDP HTTP settings of 10 Mbps down, 2 Mbps up
and 80 ms latency. Each run had ten cold and ten warm entries, a two-second frame
sample per visit and a route exit. These settings did not shape WebSockets or
CPU and do not establish an actual network RTT or phone performance.

These timings used `f54bbcbbd195c959605fc15c6327a2a111903c2e` plus the
recorded experimental dirty diffs, before the late-decode cancellation fix and
provenance-digest update. They are not exact-`e390440` performance qualification.
Serial preparation completed two 20-cycle runs. Cold p95 was 6.33 and 6.52 seconds;
warm p95 was 1.99 seconds in both. No sockets remained after any exit, no page
errors were recorded, and training remained usable. Required art alone transferred
4.686 MB cold, exceeding the draft's proposed 4 MB critical-download budget;
total entry bytes were incomplete because some response-finish events were not
available at the snapshot. The cold result also exceeds the proposed six-second
target. Two-second frame samples do not qualify the full-room 15-minute target.

An overlapping mandatory-load prototype was deliberately dropped. Two complete
repeats improved cold p95 to 5.75–5.76 seconds but worsened warm p95 to 2.06–2.12
seconds. Its first run failed on visit 12: the room socket closed during the
observation window after readiness, without a captured close reason. The later
green repeats do not explain that failure. Independent Astra high review agreed
the added coordination was not justified; serial preparation remains in place.
Behavioral tests retain control/room gating, exit during preparation and required
art failure returning to usable training, without promising request concurrency.
A separate native-decoding regression first showed all three late campus JPEG
bitmaps remained open after exit. The loader now releases the prepared resource
and rejects when its combined cancellation/deadline signal expired during parse;
all three bitmaps close in the browser regression. This establishes that specific
ownership path, not general GPU-memory qualification.

App-owned campus, pitch, cannon and lamp art now shares a checked
`assets/team-world/manifest.json` with collision/provenance hashes and regression
caps. Preparation rejects drift before replacing generated files, rejects
external GLB payloads and uses a digest-named asset directory. All app adapters
derive URLs from the same manifest; Avatar Studio remains independently pinned.
An old client may receive an unavailable World asset after an update and can
return to training/reload. Immutable local paths do not prove coordinated relay
rollout; deployed version agreement and old/new cache journeys remain D12/D05
qualification work.

Current release evidence belongs in DEV_ENVIRONMENT.md. Active acceptance work is
D04–D06 and D12–D20 in ROADMAP.md: phone/load/renderer/recovery, durable ownership
before decorating, saved appearance, travel scope and package independence.
Production World navigation remains off during qualification.

## Replacement acceptance ledger

This ledger maps the September 6, 2026
[Zoomap draft specification](https://github.com/dafepro/zmap/blob/76c2a0e30e4c8b18a301217fb8a29cf9eb71e457/docs/specs.md)
to the current integration. Its requirements and numeric budgets remain a review
draft. **Partial** means a narrower local check passed; the complete journey is
still unaccepted. **Untested** means the outcome has no current qualifying proof,
including where the feature is absent. No requirement is silently superseded.

The campus is a transient shared-play slice. The draft's first playable also
requires owned placement, an acknowledged edit retained across re-entry, and
phone host-loss recovery. It therefore remains unfinished. The current fresh
World decision isolates Canvas state; it does not discard earned ownership or
approve a rollback policy for future saved World edits.

| Journey | Requirement coverage                       | Current evidence and result                                                                                                            | Work required for acceptance                                                                                                                                         |
| ------- | ------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| A-01    | Z-01, Z-02, Z-03, L-01, L-06, N-01         | Partial: real local browser movement, two-player presence, touch emulation and route/socket disposal in `e2e/pwa-team-world.spec.ts`.  | Named physical phones and desktop browser matrix; menu/input isolation, lifecycle and deployed access. D04, D11, D12.                                                |
| A-02    | Z-04, Z-06                                 | Partial: authored bridge/underpass, static support/geometry checks in `services/team-world/campus-map.test.mjs`, shared soccer checks. | Two peers at the same screen position on different levels; wrong-level actions, ball slope behavior and human readability. D04, D06.                                 |
| A-03    | Z-05, Z-06, Z-07                           | Partial: two-client balls, goals, tools, emotes and lamps synchronize locally.                                                         | Third client joining mid-action without reset; simultaneous actions and convergence under impairment. D04, D12.                                                      |
| A-04    | Z-08, Z-09, Z-11, L-03                     | Untested: World has no durable placement UI/store; relay commits are rejected.                                                         | Inventory policy, trusted CAS/idempotency persistence, all edit/return commands and lost-reply/concurrent checks. D14–D16.                                           |
| A-05    | Z-09, L-01, N-05                           | Partial: API/relay contracts check trusted access; browser session revocation is covered.                                              | Play versus edit rights, forged durable commands, stale authority and cross-team cases on deployed integration. D12, D14–D16.                                        |
| A-06    | Z-12, N-04, N-06                           | Partial: local connection-loss/retry and two-client transient play.                                                                    | Abrupt host loss and phone suspension, recovery distribution, single accepted authority and preserved saved rights/edits. D04, D06, D12, D15.                        |
| A-07    | Z-11, N-06                                 | Untested: current transient map resets when empty; no saved layouts exist.                                                             | Restart and room-sleep contract with persistent layouts/ownership; measure idle simulation and shared service costs. D04, D14, D15, D26.                             |
| A-08    | Z-10, L-01, L-06, N-02                     | Partial: required-asset failure returns to usable training; all current art groups are mandatory.                                      | Cosmetic fallback that remains playable, unsupported graphics/context loss and distinct useful recovery states on devices. D05, D06, D11.                            |
| A-09    | Z-13, Z-01, Z-12                           | Untested: linked travel/return is absent.                                                                                              | Implement destination policy and safe failure/return, or record an explicit owner scope revision. D12, D19.                                                          |
| A-10    | Z-13, L-03                                 | Untested: map-generation migration for owned placements is absent.                                                                     | Compatible restore and incompatible archive/return policy, staff change and no entitlement loss. D14, D15, D19.                                                      |
| A-11    | N-01, N-02, N-03, N-04, N-06               | Partial: local desktop entry/exit and asset measurements; no full-team or physical-phone cost qualification.                           | Named devices, distinct full room, 15-minute soak, complete critical/total bytes, real transport faults, CPU/memory/traffic/persistence/delivery cost. D04–D06, D12. |
| A-12    | Z-07, Z-14, N-08                           | Partial: pinned public zmap packages and app-side map/behavior adapters.                                                               | Runnable independent consumer adding a map and toy solely through public interfaces; package docs/license/upgrade evidence. D18, D20.                                |
| A-13    | Z-03, L-06, N-07                           | Partial: 320px/fullscreen touch emulation, public native controls and reduced-motion rendering paths.                                  | Physical portrait readability, keyboard-only menus/input isolation, muted/reduced effects and low-quality play. D04, D06, D11.                                       |
| A-14    | Z-11, L-03, N-08; specification section 10 | Untested: production World navigation remains off; no pilot rollback with new placements has run.                                      | Immutable cutover and rollback preserving identity, inventory and post-cutover data under an approved migration policy. D14, D15, D20, D27.                          |

The journey table covers every Z-01–Z-14 and N-01–N-08 requirement. These three
L requirements need additional evidence beyond that table. Z-10/L-03 also needs
the saved-appearance proof missing from the current preset outfits:

| Requirement                 | Current evidence and result                                                                                              | Work required for acceptance                                                                                                                                                               |
| --------------------------- | ------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Z-10/L-03 chosen appearance | Untested: the saved portrait is separate from three server-selected World outfits.                                       | Saved approved appearance visible locally and to peers, compatible/unsupported-item fallback and unchanged movement/access/rights; or an explicit owner-approved scope revision. D14, D17. |
| L-02 first map              | Partial: campus has shared pitches, furnished terraces, ramps, bridge and underpass.                                     | Physical play/readability evaluation and owned decoration space once policy/store exist. D13–D16.                                                                                          |
| L-04 safe social play       | Partial: predefined signals, private team rooms and bounded access/message contracts; no player chat or uploads.         | Verify effective deployed policy, disruptive-effects controls and audited staff cleanup for future saved placements. D02, D12, D14–D16.                                                    |
| L-05 training purpose       | Partial: World scores stay transient, outside training/reward authority; training remains available after asset failure. | Invented-data walkthrough of short useful visits, clear reward/participation meanings and no pressure to attend World. D13, D21.                                                           |

Record exact candidate/artifact identity and passed, failed or skipped gates in
DEV_ENVIRONMENT.md for each qualified release. Tests and measured subcases cannot
close a complete journey while its listed outcomes remain untested. Formal scope
changes belong in OPEN_DECISIONS.md until resolved and then in this contract.
