# Team campus assets

App-owned content for `team-world-campus-v2`, refined September 17, 2026.

## Reused sources

- [Kenney Furniture Kit](https://kenney.nl/assets/furniture-kit), CC0: sofa,
  lounge chair, coffee table, picnic table and potted plant. Originals and the
  original license are retained in `source/furniture/`.
- [Kenney Nature Kit](https://kenney.nl/assets/nature-kit), CC0: oak, small tree,
  bush, broad-leaf planting and rocks. Originals and license are retained in
  `source/nature/`.
- The existing app cannon, interactive lamp and pinned Avatar Studio character
  and equipment assets remain separate runtime assets. See the parent provenance
  document and their original licenses.

The Blender builder normalizes scale, applies the campus palette and merges
static geometry by district/material. The low timber benches, goal frames and
nets, planters, lanterns, pergolas, canopy sails, banners, railings, pitches and
terrain caps are authored geometry. The source kit's bench was too tall at the
chosen character scale; it is not used in the shipped scene.

## Generated materials and concept

`reference/master-v1.png` is a generated art-direction reference based on the
user-supplied Zoomap inspiration picture and the existing Avatar Studio style
reference. The exact prompt is beside it. It is not a gameplay screenshot.

The three original PNG swatches in `textures/` were generated with built-in
image_gen for sandstone paving, turf and timber. Prompts are in
`textures/prompts.md`. They are base-color maps, with no scene lighting baked in.
The timber repeat can be visible on very long surfaces; UV scale keeps ordinary
furniture within a small number of repeats. No third-party texture download or
unverified marketplace model is used.

## Rebuild and distribution

From the repository root, with Blender 5.2 installed:

```sh
blender --background --factory-startup --python tools/team-world/build-pitch-items.py
blender --background --factory-startup --python tools/team-world/build-campus.py
pnpm exec prettier --write app/team-world/world.json
node scripts/prepare-team-world.mjs
```

The deterministic builder writes the shared `app/team-world/world.json`, an
editable packed `models/team-campus.blend`, the runtime `models/team-campus.glb`
and an ignored art-review render in `outputs/campus/`. It preserves the approved
map object/action definitions. Blender backup files are ignored.

The campus and two pitch-item GLBs are copied to `public/team-world-assets/campus-v2/`; the campus's three images
are embedded once. Source models, Blender files and concept images are not
included in the deployed public asset directory. Tests cap the static export at
12 MiB, 80 meshes and 100,000 triangles.

## Interactive soccer and underpass presentation

The previous baked goal grids were removed. `build-pitch-items.py` authors reusable
`pitch-goal-v2.blend/.glb` and `pitch-scoreboard-v2.blend/.glb`: tubular goal frames,
three-dimensional side/roof/rear rope nets, rear supports and feet; beveled
scoreboard housing, visor, foundations, braces and raised labels. Each goal is
under 10,000 triangles and each board under 5,000; each model is under 1 MiB.
Thin net strands omit invisible internal caps. The renderer adds instanced 3D
score digits and drives net response from the accepted pitch behavior state.

Soccer balls remain original deterministic truncated-icosahedron geometry with
twelve dark pentagons and twenty ivory hexagons, in two material groups per ball.
No new marketplace asset is used.

`reference/underpass-v1.png` was generated using the built-in image-generation
tool as the depth-aware grey silhouette/cream rim reference. Its prompt is saved
alongside it. It is a design reference, not a runtime screenshot.
