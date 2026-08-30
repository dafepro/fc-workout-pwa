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
  camp lantern, pennant flag, water cooler, and training cone are stamps.
- The earned beach ball is an item because it has a dynamic body, solid and kick
  colliders, and the Lounge ball behavior.
- Boost pad, bounce drum, pinwheel, orbit beacon, breeze fan, soft sand mat,
  speed lane, wobble cone, swing gate, mini goal, and ball cannon are included
  items. Each declares two compatible effects through the shared deterministic
  composite behavior and exposes matching solid or sensor collider geometry.

The four Starlight definition IDs retain their existing `zoomigo-prop-` names.
Generation 17 is a clean room cutover following the mini-goal v4 capture
geometry; no
compatibility import or destructive migration is needed. Their typed catalog
kind and capability contract are authoritative.

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
