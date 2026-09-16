# Team campus assets

App-owned content for `team-world-campus-v1`, authored September 16, 2026.

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
blender --background --factory-startup --python tools/team-world/build-campus.py
pnpm exec prettier --write app/team-world/world.json
node scripts/prepare-team-world.mjs
```

The deterministic builder writes the shared `app/team-world/world.json`, an
editable packed `models/team-campus.blend`, the runtime `models/team-campus.glb`
and an ignored art-review render in `outputs/campus/`. It preserves the approved
map object/action definitions. Blender backup files are ignored.

Only the GLB is copied to `public/team-world-assets/campus-v1/`; its three images
are embedded once. Source models, Blender files and concept images are not
included in the deployed public asset directory. Tests cap the static export at
12 MiB, 80 meshes and 100,000 triangles.
