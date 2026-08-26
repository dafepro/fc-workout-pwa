# Team Lounge V2 architecture

Status: approved direction; development-only buildout in progress.

## Product outcome

Team Lounge V2 is a brief, persistent team place rather than a game hub. A
player should enter directly from Today, move immediately, notice what changed,
leave one safe trace, and optionally interact with one weekly attraction.

The first room is **Beach Boardwalk**. It supports movement, safe teammate
presence, persistent stamps, and one kickable beach ball. No workout data,
rankings, chat, currencies, quests, or reward catalog belongs in the room.

## Non-negotiable boundaries

| Zoomigo owns                                                         | `dafepro/canvas` owns                                    |
| -------------------------------------------------------------------- | -------------------------------------------------------- |
| Session authentication and team membership                           | Rendering and camera fitting                             |
| Whether the player may enter this team room                          | Pointer coordination and direct avatar dragging          |
| Safe display identity and avatar configuration                       | Deterministic simulation and cosmetic physics            |
| Earned inventory, placement authorization, and consumption           | Room transport, host lease, replication, and checkpoints |
| Weekly theme selection and reset policy                              | Versioned canvas and item definitions                    |
| Moderation, abuse controls, analytics policy, and product navigation | Bounded presence/canonical/effect projections            |

Canvas state can never grant training completion, Momentum, a prize box, a
stamp, or room access. Zoomigo sends only the minimum safe room projection:
stable player ID, predefined display name, selected avatar art, and allowed
inventory actions. Private notes, raw performance, assessments, and workout
details never enter Canvas packets, snapshots, logs, or metrics.

## Versioning and rollout

- V1 remains the production implementation and the development rollback path.
- A development-only Me console setting selects `V1` or `V2` on the current
  device. Production ignores and does not render the selector.
- The player Team route mounts exactly one adapter. The unused runtime is not
  imported, initialized, connected, or rendered.
- V2 is lazy loaded after selection so PixiJS, Rapier, and the simulation worker
  do not increase the Today or Me eager bundle.
- V2 can become the default only after the parity, safety, device-budget, and
  rollback gates in the delivery tracker pass.

## Library consumption

Canvas currently has no coordinated registry release or Go module tag. During
the development gate, Zoomigo consumes reproducible packed JavaScript artifacts
from one exact upstream commit and records their SHA-256 digests in a provenance
manifest. It never imports Canvas source through relative paths.

The authenticated-room slice may begin only after the JavaScript packages and
Go rooms SDK are pinned to the same Canvas commit and protocol version. A
registry release can replace the local archives later without changing the
Zoomigo adapter. Partial or floating-main dependency sets are forbidden.

## Runtime shape

```text
Me dev console
    -> lounge version setting
        -> TeamCanvasWidget adapter resolver
            -> V1 built-in adapter (current)
            -> lazy Team Lounge V2 adapter
                -> Zoomigo host adapter
                    -> CanvasRuntime + application worker
                    -> authenticated RoomSession (connected slices)
                -> DOM overlays for names, emotes, trays, and controls
```

The V2 adapter does not pretend to satisfy the V1 room-action implementation.
It receives a narrower Zoomigo-owned host contract for identity, access,
inventory, lifecycle, and analytics, then uses Canvas public APIs for the room.
Shared product ports are extracted rather than translating Canvas physics back
through V1 movement and piece endpoints.

## Room and weekly identity

- Product room ID: `team:<team-id>:lounge:<week-key>:v<template-version>`, where
  the existing Zoomigo week key is the team's local Monday date (`YYYY-MM-DD`).
  A template correction starts a new reversible room generation instead of
  reinterpreting or deleting an existing snapshot.
- Canvas template binding: an exact ID and version such as
  `zoomigo-beach-boardwalk@3`.
- The server, never the browser, resolves product room to template.
- The authenticated ticket projects the server-owned theme ID, theme version,
  and display name that correspond to that exact binding. The client accepts
  only supported manifests and never invents a fallback theme for unknown data.
- A weekly room is immutable after binding. A new week gets a new product room,
  which provides the reset without deleting the prior week's snapshot.
- Carry-forward inventory stays in Zoomigo. Only explicitly placed room
  instances live in the weekly Canvas snapshot.

## Initial scene

Beach Boardwalk contains:

- a bounded portrait-first walkable area with a responsive camera;
- fixed boardwalk, sand, water-edge, and prop collision geometry;
- a system-owned beach ball that avatars can kick but cannot delete;
- open stamp placement inside a small server-enforced outer margin;
- one local avatar plus safe name overlay;
- active teammates when connected, with inactive/disconnected treatment added
  in the presence slice.

The room's one attraction is seeing team changes and nudging the ball. It does
not include scoring in the first release.

## Controls and accessibility

- Pressing on the player's avatar claims movement; dragging empty room space
  does not move the player and remains available for room interactions.
- The avatar follows the pointer through the Canvas collision controller.
  Pointer targets are sampled at the 60 Hz simulation cadence and release stops
  movement. Direct dragging does not add a flick or coast gesture.
- Four bottom actions are reserved: Emotes, Stamps, Items, and Map. Map stays
  visibly unavailable until a room requires it; it does not render a dead
  button.
- Stamps use `pick -> tap anywhere inside the room margin`. A vertical drag on
  the placement surface still scrolls the page. Rotation and scale appear only
  after an editable owned item is selected.
- Stamp rotation uses two 15-degree step controls. Pressing once advances once;
  holding repeats in either direction through any number of revolutions. Stored
  angles are normalized into `[-180°, 180°)`.
- Projected DOM controls mark themselves as outside Canvas pointer routing
  before the room's native pointer handler runs. A size or rotation press keeps
  the selected item and reaches its semantic button; tapping unmarked room
  space may still deselect it.
- Player names and controls are semantic DOM overlays. The canvas has an
  accessible name and a concise non-visual status summary.
- Development controls can reveal the authored collision shapes plus the
  runtime role, render/simulation rate, interpolation depth, extrapolation
  count, and reconciliation error. The panel is absent without server-enabled
  developer controls.
- The layout must work at 320 CSS pixels, safe-area insets, portrait and
  landscape, Android Chrome, iOS Safari, keyboard, and reduced motion.

## Presence, traces, and emotes

- Live presence comes only from server-authenticated Canvas identity and is
  merged client-side with the already-authorized Zoomigo Team roster. Safe
  names and avatar configurations never enter Canvas snapshots. Connection IDs
  are never product identity.
- Roster and avatar presentation refreshes update the DOM overlay through a
  latest-value boundary. They do not recreate the Canvas room runtime; only a
  team or player identity change starts a new session.
- The Canvas avatar entity remains the sole physics, collision, and pointer
  authority. Its built-in placeholder sprite is transparent, and the safe DOM
  avatar is the sole visible representation projected from that entity. This
  avoids a second visible body lagging behind during fast movement.
- A reconnect reuses one stable avatar entity.
- Short emotes are predefined, transient effects and disappear after a bounded
  duration. They are not chat and are not replayed.
- Offline visit traces are predefined, capped, and expire with the weekly room.
  They show that a teammate visited without exposing a workout or timestamp
  precise enough for surveillance.

## Persistence and inventory

- Canvas persists transforms, physics state, and template-owned items.
- Zoomigo grants one latched placement credit for each distinct team-local day
  with an accepted workout or planned-rest check-in. Multiple activities on
  the same date do not increase the budget, and deleting a workout does not
  revoke an already granted credit.
- Zoomigo validates the permanent stamp unlock, weekly earned budget, room
  margin, authenticated owner, and current team-local edit day before a durable
  Canvas mutation changes canonical state.
- Move, scale, and rotate controls publish authorized full-transform previews
  through the shared Canvas presentation stream. Every viewer therefore sees
  manipulation in progress, while only the operation-specific final command is
  persisted. Preview authorization rechecks position, scale, rotation, owner,
  and edit day so a forged move preview cannot bypass another transform rule.
- The manipulating owner's Canvas presentation keeps the newest local
  transform until canonical state confirms it or a bounded timeout expires.
  Delayed older projections cannot momentarily replace the local scale or
  rotation, while other viewers continue to receive the server-authorized
  preview stream.
- The server stamps each accepted placement with canonical `placementDay`
  metadata. All of the owner's current-day placements remain editable; prior-
  day placements are immutable. Canvas cannot author or increase either value.
- Room generation V3 reserves one simple item slot for each of seven daily
  credits across all 24 allowed avatars, plus the system ball. Increasing this
  ceiling does not pre-create or simulate empty items; device-budget testing
  must still cover a deliberately full room before production cutover.
- Reconnect recovery derives used budget from canonical room items, so a lost
  client acknowledgement cannot spend or restore a credit twice.
- Dropping an owned current-day placement into the lounge trash permanently
  removes that room entity. Because weekly usage is derived from canonical room
  items, its placement credit becomes available again. The permanent collection
  unlock is unaffected. Prior-day and teammate placements remain immutable.
- System items are immutable to player edit/delete operations.

## Failure behavior

- Loading shows the weekly theme and a calm connection state, not a separate
  lobby.
- Authentication, access, version, or template failures fail closed.
- A reconnect keeps the last presented room visible, pauses shared authority,
  and resumes from canonical state.
- If V2 cannot initialize in development, show a recovery panel with **Try
  again** and **Switch to V1**. Never silently run both engines.
- Route exit, backgrounding, and adapter switch stop the runtime and worker,
  unsubscribe overlays, and close transport ownership.

## Metrics and logs

Name-free metrics cover join result, time to first presented frame, reconnects,
host migrations, long frames, input-to-present latency, correction distance,
checkpoint age, placement result, and runtime/worker errors. Dimensions are
bounded enums such as adapter version, template ID/version, device tier, and
failure code. They never contain player/team IDs, display names, item free text,
or snapshots.

Backend logs use request/room correlation hashes that are short-lived and not
stable player identifiers. Major mutations and access refusals are audit events;
high-frequency movement is metrics-only.

## Deferred decisions

- Whether later consumable placeables need a different removal/refund rule than
  permanent stamp unlocks.
- Whether a later shared goal counter is Canvas behavior state or a Zoomigo
  projection. It cannot affect training or prizes without a server-owned rule.
- Multi-replica room ownership. V2 inherits the existing single-replica limit
  until a shared coordinator is selected and tested.
- Physical-device performance budgets must be measured before production
  default; Canvas itself lists these profiles as incomplete.
