# Team Lounge V2 implementation plan

Status: active.

## Delivery strategy

Each segment ends in a runnable, testable vertical slice and updates
`TEAM_LOUNGE_V2_DELIVERY_TRACKER.md` in the same commit. V1 remains untouched
except for the adapter selector until a segment deliberately replaces shared
code.

## Proposed file tree

Only create entries when their segment begins.

```text
app/
  player/
    dev/PlayerDevSettings.tsx                 # development-only V1/V2 choice
    components/PlayerDevConsole.tsx           # labeled selector and reset
    team-canvas/
      TeamCanvasWidget.tsx                    # one-adapter resolver
      team-lounge-host.ts                     # shared Zoomigo-owned host port
  team-lounge-v2/
    TeamLoungeV2.tsx                          # route-level lounge UI
    team-lounge-v2.css                        # mobile shell and overlays
    content.ts                                # centralized copy
    adapter.tsx                               # lazy adapter entry
    LocalLoungeCanvas.tsx                     # Canvas public runtime composition
    local-simulation.ts                       # disposable local simulation adapter
    scene/
      beach-boardwalk.ts                      # template and item definitions
      assets.ts                               # allowlisted room assets
    overlays/
      AvatarOverlays.tsx                      # safe names/status/emotes
    controls/
      LoungeActionBar.tsx
      PlacementTray.tsx
    data/
      lounge-gateway.ts                       # tickets and app-authorized mutations
    telemetry.ts
    __tests__/
      adapter-selection.test.tsx
      beach-boardwalk.test.ts
      runtime-lifecycle.test.ts
vendor/
  canvas/
    PROVENANCE.md                             # commit/version/digests/rebuild steps
    *.tgz                                     # packed public JS packages, dev gate
backend/
  internal/teamlounge/
    auth.go                                   # Canvas Authenticator adapter
    store.go                                  # Canvas Store adapter
    templates.go                              # room -> exact weekly template
    metrics.go
    *_test.go
  internal/httpapi/
    team_lounge.go                            # ticket/product mutation routes
    team_lounge_test.go
  migrations/
    0000xx_team_lounge_v2.up.sql
    0000xx_team_lounge_v2.down.sql
docs/
  TEAM_LOUNGE_V2_ARCHITECTURE.md
  TEAM_LOUNGE_V2_IMPLEMENTATION_PLAN.md
  TEAM_LOUNGE_V2_DELIVERY_TRACKER.md
  TEAM_LOUNGE_V2_MANUAL_TEST.md
```

## Segment 0 — boundary and reproducibility

Outcome: a reviewer can understand ownership, rollout, risks, dependency
provenance, and completion gates before runtime code lands.

- [x] Audit current V1 and Canvas public contracts.
- [x] Record safety/privacy boundaries and weekly room identity.
- [x] Segment the implementation and define rollback.
- [x] Pack the three coordinated Canvas JS packages from one verified commit.
- [x] Record versions, source commit, SHA-256 digests, and rebuild commands.
- [x] Verify the Canvas package-artifact/release gates before consuming them.

## Segment 1 — dev selector and local room

Outcome: a developer can choose V2 in Me, enter Team, move a Zoomigo avatar in
Beach Boardwalk, kick one ball, and return to V1 without a reload race.

- [x] Add a `teamLoungeVersion` dev setting with safe parser/reset behavior.
- [x] Render the selector only when server-projected dev controls are enabled.
- [x] Resolve and lazy-load one adapter; prove the inactive adapter does not
      mount or connect.
- [x] Compose the Canvas scene, input, renderer, and packaged simulation worker
      from public package exports.
- [x] Add a minimal versioned Beach Boardwalk scene and system-owned ball.
- [x] Add direct avatar press/drag movement, a temporary avatar token/name overlay,
      transient emotes, loading/error
      states, and the four-control shell.
- [x] Tune direct drag to the simulation cadence, remove release coast, align
      authored collision geometry, and expose a dev-only collision/diagnostics
      review panel.
- [x] Keep unavailable controls explicit and noninteractive.
- [ ] Cover selection, lazy failure, route cleanup, movement, and reduced motion.
- [x] Verify at 320 CSS pixels and with one Android-sized viewport.

The local room is a development integration proof, not a multiplayer claim.
Its UI must label the connection state in developer tooling.

## Segment 2 — authenticated shared room

Outcome: two authenticated members of one team see the same room, avatars, and
ball while another team cannot join it.

- [x] Pin the Go rooms SDK to the same Canvas release commit/protocol.
- [x] Implement Canvas Authenticator, Store, and RoomTemplateResolver adapters.
- [x] Run Canvas conformance kits against the real Zoomigo database adapters.
- [x] Issue short-lived, audience-restricted, one-time credentials and validate
      exact WebSocket origins.
- [x] Map one team/week to one exact Beach Boardwalk template version.
- [x] Add route/background/reconnect lifecycle and visible recovery states.
- [ ] Add two-client, reconnect, stale-ticket, wrong-team, and protocol-mismatch
      black-box coverage.

## Segment 3 — presence and persistent changes

Outcome: returning players can tell what changed without adding a feed.

- [x] Render active teammates from authenticated presence with safe names and
      saved Zoomigo avatar art.
- [x] Merge presence with roster state without exposing workout data or storing
      roster presentation in Canvas snapshots.
- [x] Persist the ball and system scene checkpoint across room sleep/restart.
- [x] Add capped predefined visit traces for earlier visitors.
- [x] Add five transient predefined emotes with expiry and rate limits.
- [ ] Cover reconnect identity, stale avatars, expiry, and no-cross-team leaks.

### Segment 3A vertical slice — social signals and weekly visit traces

This slice makes the shared room feel inhabited without adding chat, a feed,
or another Zoomigo realtime transport.

1. Extend the pinned Canvas protocol and SDK with a generic participant signal.
   The server allowlists signal kinds, stamps authenticated sender identity,
   enforces a payload cap and cooldown, and relays the signal only inside the
   current room. Signals are transient and never enter checkpoints or replay.
2. Map the five Zoomigo emotes to five payload-free Canvas signal kinds. Render
   a received emote above the sender's current avatar for a bounded duration;
   do not render an optimistic duplicate before the server accepts it.
3. Record one visit per authenticated player and immutable weekly room when the
   Canvas socket is accepted. Expose a same-team, capped trace projection with
   no exact timestamp, workout data, connection identifier, or free text.
4. Place up to three prior-visitor traces at predefined boardwalk anchors.
   Active players and the current player are excluded so traces do not compete
   with live presence.
5. Cover allowlists, rate limits, room isolation, weekly expiry, reconnect
   idempotency, roster safety, accessible copy, and timer cleanup before dev
   deployment.

Proposed file tree for this slice:

```text
Canvas/
  packages/protocol/proto/room.proto
  packages/protocol/src/gen/room.ts
  packages/client/src/net/room-client.ts
  packages/client/src/runtime/{room-session,canvas-runtime}.ts
  packages/client/test/participant-signals.test.ts
  server/gen/canvasphysicsv1/room.pb.go
  server/pkg/roomsdk/{config,room}.go
  server/pkg/roomsdk/participant_signal_test.go

Hill Striders PWA/
  backend/migrations/000030_team_lounge_weekly_visits.{up,down}.sql
  backend/internal/teamlounge/{store,store_test}.go
  backend/internal/httpapi/{team_lounge,team_lounge_http_test}.go
  app/team-lounge-v2/data/{lounge-gateway,lounge-gateway.test}.ts
  app/team-lounge-v2/{SharedLoungeCanvas,adapter,presence}.tsx
  app/team-lounge-v2/overlays/{AvatarOverlays,VisitTraces}.tsx
  app/team-lounge-v2/social/{emotes,emotes.test}.ts
  app/team-lounge-v2/team-lounge-v2.css
```

## Segment 4 — app-authorized stamps and items

Outcome: earned Zoomigo inventory can be placed once and remains in the weekly
room without letting the Canvas runtime mint inventory.

- [ ] Add Stamps/Props tray using the existing unlock inventory.
- [ ] Author placement zones and accessible invalid-placement feedback.
- [ ] Implement reservation/idempotency transaction across Zoomigo inventory
      and Canvas durable spawn.
- [ ] Add owner-authorized move/rotate/scale after selection.
- [ ] Define and implement removal/refund semantics before enabling delete.
- [ ] Cover tampered asset IDs, exhausted copies, retry, reconnect, and
      simultaneous placement.

## Segment 5 — weekly cadence and theme framework

Outcome: the room resets safely each week and can add one attraction without
changing the core controls.

- [ ] Bind the current team week to an immutable template ID/version.
- [ ] Preserve player inventory while isolating prior weekly snapshots.
- [ ] Add theme metadata and staged environmental changes as data.
- [ ] Prove daylight-saving/timezone and asleep-room rollover behavior.
- [ ] Add operator preview/rollback tooling before a second production theme.

Future themes progress one interaction at a time: Campfire Night, Soccer Field
Hangout, Stormy Sky Deck, then Treasure Island. Linked rooms remain out of the
initial production scope.

## Segment 6 — production hardening and cutover

Outcome: V2 is eligible to replace V1 after evidence, not simply feature count.

- [ ] Name-free metrics/logs/analytics and operational alerts cover every major
      join, lifecycle, placement, persistence, and rendering failure.
- [ ] Meet measured CPU, memory, GPU, bandwidth, long-frame, and bundle budgets
      on representative low/mid/high mobile devices.
- [ ] Pass Android Chrome/iOS Safari, 320px, landscape, keyboard, screen reader,
      reduced-motion, background/foreground, and PWA update tests.
- [ ] Run the intentional full Docker E2E and VM smoke/recovery gates.
- [ ] Validate restore/rollback with persisted V2 rooms.
- [ ] Obtain product/safety review and explicitly change the default.
- [ ] Retire V1 only in a later cleanup slice after the rollback window closes.

## Verification policy

Use red-green-refactor. User-visible flows receive black-box coverage with real
containers and migrations where the segment has backend behavior. Ordinary
completion runs targeted tests, formatting, lint, typecheck, static checks, and
the production build. Full Docker E2E/VM suites run at the release-candidate
gate rather than on every segment.
