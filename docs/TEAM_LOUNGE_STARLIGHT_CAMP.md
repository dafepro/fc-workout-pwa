# Team Lounge theme candidate: Starlight Training Camp

Status: review candidate, not scheduled. Theme scheduling and rollback UI remain
out of scope until this package is explicitly approved.

## Immutable identity

- Proposed theme ID: `starlight-training-camp`
- Proposed theme version: `1`
- Canvas size and orientation: the canonical 100-by-150 top-down Lounge
- Background: `/team-lounge/starlight-training-camp-v1.png`
- Room generation: intentionally unassigned until scheduling is approved

This is a second visual package, not a second Lounge implementation. It uses the
same avatar, ball, presence, inventory, placement-credit, one-use permit,
reconciliation, and owner-only edit contracts as Beach Boardwalk. It adds no
route, selector, Map, camera behavior, compatibility path, or API replica.

## Visual direction

Starlight Training Camp is a calm blue-hour soccer camp with a lodge, perimeter
string lights, distant practice goals, a safely enclosed campfire, and a broad
open turf center. Navy and forest green keep it grounded; amber lighting and
small lime accents connect it to the consolidated application shell.

The center stays deliberately low-contrast and obstruction-free. Decorative
weight belongs at the edges so avatars, the shared ball, placement ghosts, and
selection rings remain legible at 320 CSS pixels. The lower action-dock area
contains no essential scenery.

## Included stamp expansion

These four predefined decorations are included stamps rather than Prize Box
rewards. That avoids silently changing the still-open rarity and destination
balance. They consume the same weekly placement credit and exact permit path as
every other Lounge placement, but have no body, collision, or behavior.

| Stamp         | Immutable asset                           | Canvas definition                        |
| ------------- | ----------------------------------------- | ---------------------------------------- |
| Camp lantern  | `/team-lounge/items/camp-lantern-v1.png`  | `zoomigo-prop-starlight-camp-lantern@2`  |
| Pennant flag  | `/team-lounge/items/pennant-flag-v1.png`  | `zoomigo-prop-starlight-pennant-flag@2`  |
| Water cooler  | `/team-lounge/items/water-cooler-v1.png`  | `zoomigo-prop-starlight-water-cooler@2`  |
| Training cone | `/team-lounge/items/training-cone-v1.png` | `zoomigo-prop-starlight-training-cone@2` |

The cutouts are transparent PNGs capped at 384 pixels on their longest edge and
256 KiB each. They are decorative, nonblocking, non-collecting objects with no
text, branding, or player-authored content.

## Image generation record

The built-in image generation tool created the background and four cutouts on
2026-08-28. The production prompts were:

### Background

> Create an original second ZoomiGo Team Lounge theme called Starlight Training
> Camp: a cozy open-air soccer training camp at blue hour, with forest lodge,
> perimeter string lights, distant practice goals, a small safely enclosed
> campfire, and a broad flat central play area. Use a polished hand-painted 3D
> mobile-game style in a 2:3 top-down three-quarter composition. Keep the central
> 65 percent open and low-contrast. Use navy, forest green, amber, muted lime,
> natural wood, turf, and subtle field markings. No people, characters, animals,
> text, logos, UI, Map cues, arrows, navigation paths, or watermarks.

### Props

> Create one polished stylized 3D mobile-game item in top-down three-quarter
> perspective, centered with generous transparent padding and readable at 48
> pixels. Preserve genuine alpha. Use the Starlight navy, forest, amber, lime,
> cream, and natural-wood palette. No floor, text, logos, people, or watermark.

The four subjects were a camp lantern, a freestanding plain pennant flag, a
kid-safe insulated sideline water cooler, and a sturdy training cone.

## Approval checklist

- Confirm the visual tone is distinct enough from Beach Boardwalk.
- Confirm the campfire remains peripheral and does not read as an interaction.
- Confirm the four included props are useful without changing Prize Box balance.
- Run the existing 320px Lounge geometry and item-edit workflow against a
  deliberately scheduled development revision before assigning a production
  room generation.
