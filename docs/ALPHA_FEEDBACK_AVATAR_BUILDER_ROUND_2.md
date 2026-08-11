# Alpha feedback: Avatar Builder, round 2

Status: implemented and validated on `codex/avatar-studio-v1` after commit
`bd5aa4f`.

## Feedback and acceptance criteria

### Layer-specific colors

- Primary and accent colors belong to an individual visual layer, not the whole
  avatar.
- Person, kit, hats, and glasses keep independent palettes with useful defaults.
- A small color button beside each layer opens a simple two-swatch popover.
- The popover uses native color controls only; there are no text values, advanced
  sliders, saved palettes, or global color controls.
- The solid background keeps a single independent color.

### Save and return

- Avatar Builder owns editing and error feedback only.
- A successful save calls the provided handler and does not leave persistent
  success text behind.
- The focused Studio route returns to `/me` after persistence succeeds.
- The profile route owns a short-lived `Avatar saved` toast and removes the query
  flag from browser history.
- Reset is removed.

### Category structure

- Top-level categories are Person, Kit, Gear, and Background.
- Gear contains independent Hats and Glasses sublayers.
- Background contains Color and FX sublayers.
- FX includes none, orbit, and a pulsing brightness shift.

### Kit geometry

- The kit body uses one symmetric shoulder path that rises behind the head.
- The collar and sleeve fills share the same shoulder anchors so no disconnected
  shoulder edge appears when people shapes change.

## Data assumption

Configuration v4 stores four compact `primary:accent` palette strings plus one
background color. Together with the six layer selections and version, this is
exactly twelve keys and remains inside the existing server shape limit. Older
configurations intentionally fall back to initials.
