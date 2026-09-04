# Team Lounge stamps and items

The Lounge has two placeable categories with deliberately different contracts.
The category is the catalog's `kind` discriminant; a historical definition ID
prefix is not allowed to override that declaration.

## Stamps

Stamps are decorative marks on the scene. Other placed objects and avatars draw
above them. Stamp art must use a transparent background and is rendered with the
shared white keyline and soft shadow so it reads as a sticker rather than a
physical object.

A stamp has `kind: "lounge_stamp"` and `capabilities: []`. Its Canvas definition
must not declare a rigid body, collider, sensor, or behavior. New generated stamp
art should be a centered transparent PNG with a readable silhouette, no square
backplate, and enough clear padding for the shared sticker keyline.

## Items

Items affect the shared space. An item must implement at least one engine-backed
capability: `collision`, `physics`, or `behavior`. Examples include a slowing
sand surface, a rebounding wall, a highly elastic ball, a proximity-triggered
rocket, portals, gravity wells, fans, wind, oil, and ice. A visual promise alone
does not qualify.

The `LoungePropChoice` type requires a non-empty capability tuple. The catalog
test also checks the corresponding Canvas definition for a body, collider, or
behavior, preventing a type-only label from disguising inert art as an Item.
Capabilities that need new simulation behavior must be implemented and tested in
Canvas before the catalog exposes them.

## Current classification

- Bolt, fire, star, soccer, shield, target, rainbow, lion, rocket, sparkles,
  camp lantern, pennant flag, water cooler, training cone, and the eight
  predefined silly phrase decals are stamps.
- The earned beach ball is an item because it has a dynamic body, solid and kick
  colliders, and the Lounge ball behavior.
- Boost pad, bounce drum, pinwheel, orbit beacon, breeze fan, soft sand mat,
  speed lane, wobble cone, swing gate, mini goal, and ball cannon are included
  items. Each declares two compatible effects through the shared deterministic
  composite behavior and exposes matching solid or sensor collider geometry.
  The Launch pad's label and chevrons promise its actual behavior: entering
  it launches an avatar or ball along the rotated arrow and adds a hop. The Ball
  speed lane affects only tagged Lounge balls, applies sustained forward acceleration along
  its arrow instead of replacing velocity, damps only excess spin, and scales
  to 2.1×. A wobble cone remains non-blocking for avatars; avatar or ball sensor
  contact nudges and visibly wobbles the cone, while only balls receive its
  rebound impulse.
- Duck pond, hammock, robot goalie, and pinball bumper are Prize Box items.
  Development grants them with the rest of the catalog; production placement
  requires the matching server-verified unlock. Pond ducks use replicated
  smoothed inverse-distance threat steering with velocity look-ahead and
  independent paddle motion. The pond can scale to 2.4× and only mildly dampens
  a rolling ball. The hammock starts at 1.4×, can scale to 2.4×, and rocks both
  its fabric and the avatar it settles. The goalie tracks tagged balls on a
  bounded rail and adopts a moved placement as its new home. The directional
  bumper stays armed on its first frame, springs only on contact, and pops
  forward with a 56-unit impulse, above the 48-unit avatar cap. Picker artwork
  is always static.

The four Starlight definition IDs retain their existing `zoomigo-prop-` names.
Generation 21 is a clean room cutover for the revised interactive prop and edit
definitions; no compatibility import or destructive migration is needed. Their
typed catalog kind and capability contract are authoritative.

Every placed item and its radial editor derive from the same projected center
variables. Optical artwork offsets are explicit catalog metadata and are tested
separately, so fixing transparent padding cannot move the item hit target or
editor chrome. Rotate and scale controls update the local presentation on every
tap or held-repeat step. Repeated values debounce to the latest requested angle
or scale, and all permit-backed writes remain serialized so acknowledgements
advance item revisions in order without disabling the controls.

Completed teammates shown on the bench use a dedicated paint layer below every
stamp, ground effect, prop, ball, and live avatar.

The mini goal captures any tagged Lounge ball only after it reaches the back of
the net, holds it for 0.4 seconds, increments a goal-owned `00`–`99` counter,
and launches the ball out along its rotated mouth. An ejected ball cannot be
dampened or score again until it leaves that goal's sensor and remains outside
for one second. The hundredth goal wraps to `00` and emits a screen-wide,
reduced-motion-safe 100-particle burst. This is playful room state only and
never becomes player performance data.

The ball cannon accepts only the two predefined Lounge ball definitions through
its rear sensor, then relaunches them beyond the rotated muzzle. Avatars and
other props pass through without being captured.

## Placement budget

Stamps and items consume the same weekly placement budget and the same
owner-bound one-use placement and mutation permits. The action buttons show the
remaining shared count, and the picker shows placed versus earned capacity for
the current week.

## Quick-chat packs

Quick chat remains transient closed-catalog play state. The settings wheel
stores one to three selected pack IDs on the current device; it does not store
messages, identity, or room history. The server separately allowlists every
phrase ID and verifies reward-pack ownership when routing a message. Production
includes Standard and displays the five additional Prize Box packs as locked
until owned. Development grants all six and initially selects Standard, Pirate
1, and Gen Alpha so the full interaction remains easy to exercise.
