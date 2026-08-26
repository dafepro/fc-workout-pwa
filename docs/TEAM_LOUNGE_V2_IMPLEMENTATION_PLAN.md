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
      StampOverlays.tsx                       # durable stamp art and free placement surface
    controls/
      LoungeActionBar.tsx
      StampPlacementTray.tsx                  # owned-stamp chooser and result state
    placement/
      catalog.ts                              # product inventory -> Canvas definitions
      orientation.ts                          # snap angles and mirror capability policy
      coordinates.ts                          # screen-to-world free placement mapping
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
  internal/store/
    lounge_placement_credits.go               # latched daily credit writes
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

Outcome: earned Zoomigo inventory can use a weekly check-in-funded placement
budget and remains in the room without letting Canvas mint either inventory or
placement credits.

- [x] Add the Stamps tray using the existing permanent unlock inventory.
- [x] Initially author six placement zones and accessible rejection feedback.
- [x] Add a generic Canvas host-authorization seam; keep ownership, allowed
      assets, room policy, and rejection copy in Zoomigo.
- [x] Initially enforce a create-only one-stamp-per-player weekly policy in the
      serialized room loop, with an authenticated WebSocket integration test.
- [x] Persist accepted stamps in the existing weekly Canvas checkpoint and
      project their authenticated owner back to the app.
- [ ] Add props only after their ownership and interaction semantics are
      separately defined.
- [x] Add owner-authorized move and bounded scale after selection.
- [x] Add owner-only rotation in 15-degree steps in either direction, with
      normalized durable angles and shared live previews.
- [x] Define atomic replacement and explicitly keep standalone delete disabled.
- [x] Keep mirroring off until individual art opts in and Canvas supports a
      first-class reflection transform; negative scale is never a mirror API.
- [x] Cover concurrent reconnect placement and fault-injected checkpoint retry.
- [x] Supersede authored spots and the one-per-week cap with one latched credit
      per qualifying team-local check-in day, free in-room placement, and
      team-local end-of-day editing locks.
- [x] Make one authenticated server projection the V2 placeable catalog and
      refresh it after stale ownership rejection without spending a credit.

### Segment 4A vertical slice — one durable weekly stamp

The first placement slice treats every unlocked stamp as a permanent collectible,
not a consumable copy. It therefore needs no inventory reservation or refund:
the authoritative Canvas room loop permits exactly one create-only stamp per
authenticated player in that immutable weekly room. Tampered asset IDs, unowned
earned assets, off-zone coordinates, a second placement, and all edit/delete
commands are rejected before room state changes. A failed checkpoint cannot
lose inventory; the player can retry because nothing was consumed.

This cap is intentionally reversible product policy, not a database invariant.
Move, rotate, scale, delete, props, duplicate quantities, and free-form placement
remain disabled until their UX and failure semantics are designed together.

### Segment 4B vertical slice — reconnect-safe placement

The second placement slice keeps the same one-stamp rule and hardens its delivery
semantics. A placement is visibly pending after the authored spot is tapped, so
repeat taps cannot enqueue extra commands. Reconnecting clears a stranded local
pending state and the authoritative projection decides whether the stamp was
accepted; if it was not, the player can retry. Two connections for the same
player still serialize through one room, so at most one placement is accepted.

Canvas retries a transient snapshot-store failure inside its existing bounded
persistence worker. The retry does not replay the durable command or create a
second item; it only stores the newest canonical snapshot. Tests must prove an
eventual save after a fault, one accepted result across reconnecting clients,
and a clear player-facing retry path. Command-result caching and a permanent
idempotency protocol are deliberately out of scope because they would create a
broader cross-product contract than this slice needs.

### Segment 4C vertical slice — scroll-safe owner manipulation

Interaction quality is completed before weekly themes. The room listens for
gestures on one consumer-owned surface, but only the current player's avatar,
their selected stamp, or a visible control may suppress browser scrolling.
Dragging empty room space must keep the normal vertical page scroll. This uses
DOM hit targets over the projected entities rather than making the entire
Canvas a no-scroll region.

The visible DOM stamp is the only stamp artwork. Canvas keeps an invisible
world-sized hit target for selection and authorization, eliminating the
placeholder/stamp double layer. Stamps render behind player avatars so a player
never appears between two visual copies of one decoration.

An owner may tap their stamp, then drag it within the bounded room decorating
area and scale it with compact minus/plus controls. Scaling is limited to
`0.75–1.40`; move previews and committed movement remain inside the room margin.
The server rechecks owner, definition, operation, bounds, and scale. Other
players' stamps remain view-only. Rotation, delete, replacement, free inventory
consumption, and arbitrary item editing remain out of scope.

### Segment 4D vertical slice — initial restrained orientation

An owner may set their selected stamp to `−15°`, `0°`, or `+15°`. These are
explicit buttons rather than a free-rotation handle: they are easier to use on
a phone, keep the room calm, and give the server a small canonical allowlist.
Canvas passes the requested radians to Zoomigo's durable authorizer; Zoomigo
rechecks the owner and exact snap before the room changes. The persisted
projection controls the rendered angle after reconnect.

Mirroring is deliberately different from rotation. No current stamp opts into
reflection, and a negative scale is rejected rather than treated as a shortcut.
Later mirroring requires per-asset `canMirror` metadata, art review for logos,
text-like and directional assets, and a first-class Canvas transform that keeps
rendering, hit testing, persistence, and authorization aligned.

Replacement is also a separate durable operation, not `delete` followed by
`spawn`. The future player action is **Change stamp**: choose another owned
asset, preview it at the existing transform, and confirm one atomic mutation
that preserves the entity ID, owner, position, scale, and rotation. Until that
mutation succeeds, the old stamp remains authoritative; cancel or disconnect
changes nothing. This preserves exactly one active weekly stamp through every
failure. A standalone delete is not offered because “remove and reopen the
weekly slot” is a different product rule and creates an avoidable empty/failure
state. Consumable inventory remains a later, separately transactional design.

### Segment 4E vertical slice — earned weekly budget and daily locks

This slice supersedes the reversible one-stamp and six-zone policies from 4A.
One accepted workout or planned-rest check-in grants one placement credit for
that team-local date. Extra entries on the same date grant nothing more. The
credit is latched in the same database transaction as the check-in, survives a
later workout deletion, and belongs only to that Monday-based team week.
Current-week records created before the ledger migration are reconciled when a
player requests a room ticket.

The authenticated ticket projects only the earned count and current team-local
day. Canvas projects the authenticated owner and server-canonical
`placementDay` for each durable item; Zoomigo derives used and remaining budget
from canonical room state. The serialized room authorizer rejects a spawn once
the player's owned stamp count reaches the earned count. A new version-3 room
and item definition keep the policy change from reinterpreting version-2
snapshots.

Placement is now `pick stamp -> tap anywhere inside the room margin`. Overlap is
allowed; only a five-unit outer safety margin is reserved. The placement
surface keeps `touch-action: pan-y`, so a vertical drag continues to scroll the
page while an un-dragged tap places the stamp. Every current-day stamp owned by
the player can be moved, resized, or snap-rotated. At the next team-local
midnight it becomes visible but immutable. Stamps and future props will spend
the same generic weekly budget, but props remain disabled until their own
ownership and interaction rules ship.

Replacement, standalone delete, and mirroring remain separate decisions. The
initial three rotation snaps are superseded by Segment 4F; placement locations
and credits are unaffected.

### Segment 4F vertical slice — shared transform previews and full rotation

The two compact turn controls move by 15 degrees clockwise or counterclockwise
and may continue through unlimited revolutions. A press makes one step; holding
repeats. The UI normalizes the final radians into `[-π, π)` so durable state has
24 canonical orientations instead of an ever-growing turn count.

Move, scale, and rotation previews use one Canvas full-transform preview seam.
The room host relays those authorized previews in the normal presentation stream
so connected viewers see a stamp while another player manipulates it. Release
sends the operation-specific durable command; Zoomigo revalidates all transform
fields, ownership, and the current edit day before canonical state changes.
Reconnect restores only the last accepted durable transform.

### Segment 4I vertical slice — authoritative collection and access recovery

This slice removes the remaining split between what the stamp
tray offers and what the room server will authorize. Today the connected tray
can merge development Canvas settings into the player's placeable choices,
while the durable authorizer intentionally accepts only included stamps and
the player's persisted unlocks. That mismatch leaks the low-level
`stamp_unavailable` result into a normal player flow.

The socket-ticket response projects one server-owned placement catalog for
the authenticated player, team, and current room week. Each entry contains
only stable presentation metadata needed by the tray: asset ID, predefined
label/art key, source (`included` or `earned`), and whether it is new. The same
response carries the earned placement-credit count and current placement day.
The browser may filter or order this projection, but it may not add a placeable
asset. V1 developer stamp choices remain V1 scene controls and never imply V2
ownership.

If a durable spawn is nevertheless rejected as unavailable because the
collection changed between join and placement, the V2 adapter clears the
selection, refreshes the authoritative projection, and explains that the item
is no longer available. The failed attempt spends no placement credit. The
tray distinguishes ownership from placement budget: stamps answer _what can I
place?_; credits answer _how many can I place this week?_

Tests cover included and earned catalog entries, an unowned/development-only
asset never appearing, daily-box unlock to accepted placement, stale
collection recovery without credit loss, team isolation, and fail-closed
malformed metadata. Metrics record bounded rejection reasons and catalog
refresh outcomes without player, team, room, or asset identifiers.

Proposed file tree for this slice:

```text
app/
  player/team-canvas/
    TeamCanvasWidget.tsx                    # stop treating V1 dev choices as V2 ownership
  team-canvas/
    unlock-adapter.ts                       # consume authoritative placeable entries
  team-lounge-v2/
    adapter.tsx                             # refresh and recover from stale selection
    content.ts                              # actionable collection/access copy
    controls/StampPlacementTray.tsx         # source/new state and budget separation
    data/lounge-gateway.ts                  # validated placement catalog projection
backend/
  internal/teamlounge/
    inventory.go                            # one ownership/catalog projection
  internal/httpapi/
    team_lounge.go                          # include catalog with ticket response
    team_lounge_http_test.go                # authenticated black-box contract
```

### Segment 4P vertical slice — drag-to-remove current-day placements

While the owner moves a current-day stamp, the normal four-action tray is
replaced in place by one animated trash target. Pointer release is resolved by
screen coordinates before the normal controls return, so dropping there cannot
fall through and open the stamp catalog. Releasing elsewhere remains a move.
Movement is a focused interaction mode: the selected stamp's scale/rotation
tray, selection treatment, editable badges, and any previously open action menu
are removed until release. Dismissed menus do not reopen after the gesture.

Zoomigo authorizes the durable delete by authenticated owner and canonical
placement day. The entity disappears for every viewer; permanent collection
ownership remains intact. Because used weekly budget is derived from canonical
room entities, the deleted placement becomes available again without a separate
refund counter. Prior-day and teammate stamps never enter this drag state.

Proposed file tree for this slice:

```text
app/team-lounge-v2/
  SharedLoungeCanvas.tsx                   # drag tracking and durable deletion
  adapter.tsx                              # action-tray replacement target
  content.ts                               # removal and recovery copy
  team-lounge-v2.css                       # restrained drop-target states
backend/internal/teamlounge/
  placements.go                            # owner/day delete authorization
docs/
  TEAM_LOUNGE_V2_MANUAL_TEST.md            # live two-viewer deletion proof
```

### Candidate Segment 3B — predefined quick team phrases

The requested short-message affordance is tracked separately from inventory.
The current youth-safety boundary prohibits player-authored free text, chat,
comments, and direct messages. The smallest compatible feature is therefore a
predefined **Quick phrases** palette such as `Nice!`, `Over here!`, `Your
turn!`, `Good work!`, and `See you tomorrow!`.

Phrases reuse Canvas participant signals as payload-free enum kinds. The server
allowlists them, rate-limits them, and relays them only inside the current team
room. A phrase appears briefly by the sender's avatar and is neither stored,
replayed, searchable, nor addressed privately. Implementing actual typed text
requires an explicit product-safety decision plus moderation, reporting,
retention, staff visibility, and abuse-response design; it is not part of this
candidate slice.

## Segment 5 — weekly cadence and theme framework

Outcome: the room resets safely each week and can add one attraction without
changing the core controls.

- [x] Bind the current team week to an immutable template ID/version.
- [x] Preserve player inventory while isolating prior weekly snapshots.
- [x] Add a server-owned theme manifest and project supported metadata through
      the authenticated room ticket.
- [ ] Add staged environmental changes as data.
- [ ] Prove daylight-saving/timezone and asleep-room rollover behavior.
- [ ] Add operator preview/rollback tooling before a second production theme.

Future themes progress one interaction at a time: Campfire Night, Soccer Field
Hangout, Stormy Sky Deck, then Treasure Island. Linked rooms remain out of the
initial production scope.

### Segment 5A vertical slice — canonical theme identity

The backend resolves a canonical theme manifest for the team-local week before
binding or issuing a room ticket. That manifest owns the player-facing theme ID,
version, name, and exact Canvas template. The browser accepts only supported
metadata and uses it for the lounge heading; a tampered or newer unknown theme
fails closed instead of opening the wrong room.

This establishes the data boundary without silently choosing a future cadence.
Beach Boardwalk V1 remains the sole manifest until staged theme state,
daylight-saving rollover, and operator preview/rollback controls are specified
and tested together.

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
