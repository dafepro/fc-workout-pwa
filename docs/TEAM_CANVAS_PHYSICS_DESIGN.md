# Team Canvas Physics — Design Draft

Status: implemented locally for alpha review; not deployed. Last updated:
2026-08-21.

## Approved alpha slice

The first implementation uses the experience-based defaults from this draft:

- `soccer`, `balloon`, and `rocket` are the only dynamic catalog assets;
- decorative stamps never collide;
- avatars pass through one another but impart capped impulses to dynamic pieces;
- top-down fields use friction, the town uses downward gravity, and the cosmic
  scene uses low drag plus a speed cap;
- a single-replica server room owns simulation at a fixed step and sends
  structured physics frames over the existing authenticated SSE connection;
- clients send avatar movement through the existing bounded endpoint. SSE is
  preferable to adding a second WebSocket authentication/proxy path for this
  alpha because input remains client-to-server HTTP and state remains
  server-to-client streaming;
- SQLite stores strict versioned checkpoints, never animation frames or
  client-authored capabilities.

Implemented file tree:

```text
backend/internal/canvasphysics/
├── catalog.go                         # trusted asset + scene capabilities
├── engine.go                          # deterministic circle simulation
├── state.go                           # strict v1 checkpoint codec
└── *_test.go

backend/
├── migrations/000015_team_canvas_physics.*.sql
├── migrations/000016_team_canvas_developer_stamps.*.sql
├── internal/store/team_canvas_physics.go
└── internal/httpapi/team_canvas_physics.go

app/team-canvas/
├── physics.ts                         # strict frames + projection helpers
├── live-input.ts                      # bounded coalescing input queue
└── components/BoardSurface.tsx        # thin streamed-state renderer

app/data/team-canvas-gateway.ts        # structured SSE frame handling
```

## Why this stayed a separate pass

Physics introduces a different kind of shared state. The implementation keeps
simulation, trusted behavior definitions, persistence, transport, and rendering
in separate modules so the canvas does not acquire client-only outcomes that
different players would see differently.

## Product intent

Physics should make a few awarded pieces feel alive without turning the weekly
canvas into a game players must master. A soccer ball can be nudged by an avatar,
a balloon can drift upward, and a space object can coast. Most stamps remain
decorative. No raw training or assessment data affects mass, speed, or power.

Version one should provide:

- circular collision bounds only;
- a small reviewed set of dynamic stamp behaviors;
- scene-level gravity and drag rules;
- avatar-to-piece and approved piece-to-piece collisions;
- deterministic recovery from invalid, trapped, or runaway states;
- the same result for every connected player;
- reduced-motion presentation without changing shared outcomes.

It should not yet provide polygon colliders, destructible shapes, projectiles,
player-authored behavior, uploads, arbitrary scripts, or competitive scoring.

## Recommended interaction rules

1. Avatars are kinematic circles. Dragging an avatar supplies a capped velocity;
   contact transfers a bounded impulse to dynamic pieces.
2. A live dynamic stamp updated by its owner receives a renewable 240 ms
   kinematic lease. It cannot be displaced while held, but it remains a solid
   circle that can deflect free dynamic bodies. The lease naturally expires after
   release or an interrupted request, then the catalog behavior resumes. Server
   bounds still apply to every placement.
3. Only catalog entries explicitly marked `dynamic` or `static-collider`
   participate. Decorative stamps are non-colliding, so players cannot surround
   the board with an accidental wall.
4. Avatar input uses swept segment-versus-circle contact. Dynamic bodies use a
   fixed 30 Hz step, circular collision correction, restitution, and capped
   impulses. The speed and minimum-radius bounds make tunneling between body
   steps unlikely in this alpha.
5. Players may influence shared dynamic pieces with their avatars. They cannot
   directly drag another player's live stamp or delete any piece they do not own
   today.
6. Deleting one's own live stamp removes its physics entity atomically and frees
   the earned reward slot. Yesterday's settled stamp remains undeletable by the
   player under the current rule.

## Scene profiles

All values are bounded catalog presets, not developer-toolbox JSON.

| Scene profile    | Gravity  | Motion loss     | Example behavior                                                                      |
| ---------------- | -------- | --------------- | ------------------------------------------------------------------------------------- |
| `side-view`      | Downward | light air drag  | A ball falls and bounces; a balloon has upward buoyancy and gentle lateral drift.     |
| `top-down-field` | None     | ground friction | A ball rolls in the direction it is nudged, slows, and sleeps.                        |
| `space`          | None     | very low drag   | An object coasts, but a speed cap and small damping prevent permanent runaway motion. |

The castle scene would use `side-view`; the soccer field would use
`top-down-field`; a cosmic scene would use `space`. Background artwork alone
must never silently decide behavior: each reviewed background catalog entry
points to an explicit scene profile and version.

## Runaway and trap recovery

A dynamic entity enters recovery when it is outside the playable bounds, has a
non-finite value, remains above the speed cap, or cannot resolve overlap after a
bounded number of simulation steps.

The server then:

1. emits a predefined `poof` reset event;
2. removes velocity and angular velocity;
3. searches a deterministic seeded spiral from the scene's safe spawn point for
   the first collision-free circular position;
4. if no position is free, chooses the least-overlapped candidate, marks the
   entity as a faint non-colliding recovery ghost, and retries until space opens.

This avoids perpetual motion, divergent clients, and a permanent cage made from
collision stamps. The visual “explosion” is predefined and non-scoring; it is
not evidence that a player failed.

## Authority and realtime transport

The server-authoritative fixed-timestep room owns physics. Clients send bounded
avatar and owner-placement samples through the existing authenticated REST
endpoints. The room sends versioned snapshots at 15 Hz over the existing
authenticated SSE stream. Structured `piece` events carry ordinary live stamp
transforms without a full refetch; an overflow falls back to durable canvas
invalidation. This avoids a second WebSocket authentication and proxy path for
the single-replica alpha.

For the current single API replica, an in-memory room registry is sufficient for
an alpha. Before horizontal scaling, each team/week room must have one owner via
a shared coordinator, or the simulation must move to a dedicated realtime
service. Clients never elect authority.

The simulation uses a 30 Hz fixed step and sends at most 15 snapshots per second.
The browser uses short visual interpolation but does not commit collision
outcomes. Avatar and stamp inputs use coalescing 80 ms queues, never overlapping
requests. The server checkpoints periodic changed state and final room state
rather than writing SQLite on every frame.

## Extensible storage contract

Flexible state belongs in versioned, validated JSON; trusted capabilities do
not. Migration 15 adds separate records rather than widening the existing piece
row with one column per behavior:

```text
team_canvas_scene_states
  team_id, week_key, physics_version, scene_state_json, revision, updated_at

team_canvas_piece_states
  piece_id, behavior_version, behavior_state_json, revision, updated_at
```

The reviewed application catalog owns immutable capability definitions such as
collider radius, body type, mass range, restitution, damping, buoyancy, maximum
speed, and animation ID. A client can name an approved asset but cannot submit
or alter its capabilities. This prevents a request from turning a decorative
stamp into a huge invisible collider.

Example persisted state, not a client-authored capability definition:

```json
{
  "v": 1,
  "position": { "x": 43.25, "y": 61.5 },
  "velocity": { "x": 2.4, "y": -0.7 },
  "angle": 67.6,
  "angularVelocity": 12,
  "sleeping": false,
  "recovering": false,
  "resetCount": 0
}
```

Every version gets a strict decoder, byte limit, finite-number checks, and an
upgrade path. Unknown, missing, or invalid behavior state renders at the durable
piece position as non-colliding static art. JSON is never executed. Assets remain
reviewed same-origin emoji, SVG/image, or bounded sprite definitions.

At most 64 pieces per team/week receive dynamic state. A reviewed dynamic asset
placed after that safety budget is exhausted remains ordinary static art;
editing it cannot promote it around the cap.

Migration 16 adds a development-only placement budget and a durable marker that
keeps playground pieces separate from earned reward pieces. Development and E2E
builds may expose 0–16 extra slots per player/day. Production never honors those
slots, reward reconciliation ignores them, and lowering the budget does not
silently delete existing playground pieces. They remain owner-deletable today.

## Lifecycle

- Creation inserts the piece and initial physics state in one transaction.
- Owner placement resets velocity and renews a brief solid kinematic lease;
  server bounds and ownership are validated before the room accepts it. A held
  dynamic stamp can push free bodies but cannot itself be pushed.
- Same-day owner deletion removes piece state in the same transaction as the
  piece and broadcasts the removal immediately.
- At the next team-local day boundary, editable ownership settles exactly as it
  does now. Recommended default: a catalog-dynamic piece remains dynamic for the
  week, while a decorative piece remains static.
- At the weekly boundary, archive the board snapshot and start a new room. Do not
  carry velocity into the new week.
- When no clients are connected, active rooms simulate until all pieces sleep,
  with a five-second runaway budget, then checkpoint and stop. Reconnection
  resumes from that checkpoint.

## Safety and accessibility

- Cap input frequency, distance per sample, impulse, entity count, and total
  active bodies per team.
- Apply server-side membership and today's completion gate before accepting room
  input.
- Do not expose player identity in physics state beyond the safe board projection.
- Reduced motion replaces bounce/poof/interpolation with short fades and final
  positions. The authoritative outcome stays identical.
- Physics earns no momentum, stars, ranking, or additional stamps. It is a shared
  reward surface, not another performance measure.

## Test strategy

- Unit-test circle overlap, swept avatar collision, scene forces, speed caps, sleep,
  deterministic reset placement, JSON upgrades, and invalid-number rejection.
- Contract-test each catalog capability against its strict decoder and bounds.
- Run two-client black-box tests for shared impulses, deletion during motion,
  reconnect/checkpoint behavior, ownership rejection, and reduced-motion output.
- Test a populated migration and logical backup round trip before changing the
  production schema.
- Fuzz versioned JSON and physics inputs; assert the room cannot panic, emit a
  non-finite state, or exceed its entity/step budgets.

## Implemented slices

1. Reviewed catalog, deterministic circle engine, sleep, caps, and recovery.
2. Versioned migration, strict codecs, populated migration test, and logical
   backup round trip.
3. Single-replica authoritative room, authenticated SSE frames, structured live
   piece events, and bounded avatar/placement input.
4. Top-down, side-view, and space profiles plus reduced-motion rendering.
5. Firmer four-pass circle separation, higher restitution, lower field drag,
   stronger swept-avatar kicks, and development-only multi-body placement slots.

The remaining release work is review, beta instrumentation, and a shared room
coordinator before any horizontal API scaling.

## Adopted alpha decisions

Recommended defaults are shown first:

- Dynamic items: only explicitly awarded catalog items; ordinary emoji remain
  decorative.
- Avatar collisions: avatars affect dynamic items but pass through one another.
- Settling: dynamic items keep moving for the current week; all velocities reset
  at the weekly boundary.
- Scene changes: changing the scene preserves valid positions but clears
  velocity before applying the new force profile. Stale-scene checkpoints are
  rejected.
- Shared influence: every completed teammate may nudge shared dynamic items;
  direct placement remains owner-only for today's live stamp.
- Empty rooms: simulate until sleep, checkpoint, and pause.
- Recovery: deterministic poof and safe respawn; no score, penalty, or ownership
  change.
