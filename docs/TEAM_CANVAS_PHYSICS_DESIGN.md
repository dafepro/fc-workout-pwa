# Team Canvas Physics — Design Draft

Status: review required before implementation. Last updated: 2026-08-21.

## Why this is a separate pass

The board now has durable, same-day owner edits and realtime invalidation, but
physics introduces a different kind of shared state. REST plus SSE can announce
that a piece changed; it should not pretend to arbitrate collisions at animation
speed. We should agree on scene rules, ownership, reset behavior, and the
authoritative simulation before adding storage fields or a client-only engine
that different players would see differently.

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
2. A live stamp being positioned by its owner is kinematic and temporarily
   non-colliding. On release, the server places it at the closest valid point and
   then restores its catalog behavior. This prevents a drag from tunneling
   through or trapping another piece.
3. Only catalog entries explicitly marked `dynamic` or `static-collider`
   participate. Decorative stamps are non-colliding, so players cannot surround
   the board with an accidental wall.
4. Dynamic pieces use swept circle tests, positional correction, and capped
   impulses. A sufficiently fast avatar can dislodge a crowded ball, but there
   is no special client-side “pass through” exception.
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
4. if no position is free, places the entity at the center in a temporary
   non-colliding phase and retries until clear.

This avoids perpetual motion, divergent clients, and a permanent cage made from
collision stamps. The visual “explosion” is predefined and non-scoring; it is
not evidence that a player failed.

## Authority and realtime transport

Recommendation: a server-authoritative fixed-timestep room owns physics. Clients
send bounded inputs such as avatar position samples and owner placement gestures;
the room broadcasts snapshots and interpolated corrections over an authenticated
WebSocket. The current REST endpoints remain authoritative for create, delete,
and settings changes. The existing SSE stream remains useful for ordinary canvas
invalidation but is not the physics frame transport.

For the current single API replica, an in-memory room registry is sufficient for
an alpha. Before horizontal scaling, each team/week room must have one owner via
a shared coordinator, or the simulation must move to a dedicated realtime
service. Clients never elect authority.

The simulation uses a fixed step (recommended 30 Hz) and sends lower-frequency
snapshots (recommended 10–15 Hz). The browser interpolates visuals but does not
commit collision outcomes. The server checkpoints sleeping state and periodic
active state rather than writing SQLite on every frame.

## Extensible storage contract

Flexible state belongs in versioned, validated JSON; trusted capabilities do
not. A future migration should add separate records rather than widening the
existing piece row with one column per behavior:

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
  "angle": 1.18,
  "angularVelocity": 0.12,
  "sleeping": false,
  "resetCount": 0
}
```

Every version gets a strict decoder, byte limit, finite-number checks, and an
upgrade function. Unknown or invalid versions render at the durable piece
position as non-colliding static art and are queued for repair. JSON is never
executed. Assets remain reviewed same-origin emoji, SVG/image, or bounded sprite
definitions.

## Lifecycle

- Creation inserts the piece and initial physics state in one transaction.
- Owner placement temporarily changes the room body to a ghosted kinematic body;
  release is server-validated before it becomes dynamic again.
- Same-day owner deletion removes piece state in the same transaction as the
  piece and broadcasts the removal immediately.
- At the next team-local day boundary, editable ownership settles exactly as it
  does now. Recommended default: a catalog-dynamic piece remains dynamic for the
  week, while a decorative piece remains static.
- At the weekly boundary, archive the board snapshot and start a new room. Do not
  carry velocity into the new week.
- When no clients are connected, active rooms simulate only until all pieces
  sleep, then checkpoint and stop. Reconnection resumes from that checkpoint.

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

- Unit-test circle overlap, swept collision, scene forces, speed caps, sleep,
  deterministic reset placement, JSON upgrades, and invalid-number rejection.
- Contract-test each catalog capability against its strict decoder and bounds.
- Run two-client black-box tests for shared impulses, deletion during motion,
  reconnect/checkpoint behavior, ownership rejection, and reduced-motion output.
- Test a populated migration and logical backup round trip before changing the
  production schema.
- Fuzz versioned JSON and physics inputs; assert the room cannot panic, emit a
  non-finite state, or exceed its entity/step budgets.

## Suggested implementation slices

1. Add reviewed behavior and scene catalog types plus pure circle simulation;
   render it in a disconnected developer lab only.
2. Add the versioned state migration, strict codecs, upgrade tests, and backup
   coverage without enabling motion in the team route.
3. Add one authoritative single-replica room and WebSocket for a top-down soccer
   ball; validate with two real browser sessions.
4. Add side-view ball and balloon profiles, deterministic recovery, and reduced
   motion.
5. Run a small alpha, instrument resets and correction frequency, then decide
   whether shape colliders and angular impacts are justified.

## Decisions requested before slice 1

Recommended defaults are shown first:

- Dynamic items: only explicitly awarded catalog items; ordinary emoji remain
  decorative.
- Avatar collisions: avatars affect dynamic items but pass through one another.
- Settling: dynamic items keep moving for the current week; all velocities reset
  at the weekly boundary.
- Scene changes: changing the scene resets dynamic pieces to safe spawns rather
  than transforming old velocities into a new force model.
- Shared influence: every completed teammate may nudge shared dynamic items;
  direct placement remains owner-only for today's live stamp.
- Empty rooms: simulate until sleep, checkpoint, and pause.
- Recovery: deterministic poof and safe respawn; no score, penalty, or ownership
  change.
