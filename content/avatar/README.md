# Avatar content pipeline

The isolated 3D avatar demo consumes the compiled engineering catalog. It does
not read the authoring files directly and is not connected to saved player
avatars.

## Artist production packet

- [ARTIST_HANDBOOK.md](ARTIST_HANDBOOK.md) is the Blender modeling, rigging,
  material, animation, export, and acceptance contract.
- [ART_DIRECTION_VISUAL_REFERENCE_BOARD.md](ART_DIRECTION_VISUAL_REFERENCE_BOARD.md)
  locks the graphic toon direction and early artist review workflow.
- [ASSET_PRODUCTION_LIST.md](ASSET_PRODUCTION_LIST.md) is the phased commission
  list.
- [spec/production-assets.json](spec/production-assets.json) is the
  machine-readable family, budget, and per-item brief.
- [spec/avatar-asset.schema.json](spec/avatar-asset.schema.json) defines one
  artist submission manifest, with human, non-human, and cross-family examples
  in `spec/examples/`.

The current generated GLBs remain engineering fixtures. Their skeleton and
assembly behavior are useful evidence; their shapes and materials are not the
production art target. Artist wardrobe production begins only after the
artist-created `zoomigo-humanoid-v2` family pack is approved and locked.

## Source contract

- `engineering-library.json` owns stable item IDs, slots, compatibility,
  variants, and source-file paths.
- `source/**/*.glb` contains reviewable authoring exports. Each skinned garment
  uses `zoomigo-humanoid-v1`; rigid pieces declare one supported socket.
- `art-direction/zoomigo-player-turnaround-v1.png` is a historical input to the
  engineering catalog generator, not an approved production style reference.

The checked-in engineering sources are created with the repository's art
builder because Blender is not available in the automation environment. An
approved Blender export enters at the same optimization and validation seam.
Supporting multiple avatar families requires the catalog/runtime family work
described in the architecture; it is intentionally not integrated yet.

## Commands

```text
pnpm avatar:source
pnpm avatar:build
pnpm avatar:validate
```

`avatar:source` regenerates the in-repository engineering artwork. `avatar:build`
optimizes each source with glTF Transform and Meshopt, writes immutable
content-addressed runtime assets, prunes orphaned hashes, and emits the public
catalog. `avatar:validate` checks both source and compiled artifacts, including
the skeleton, skin weights, sockets, metadata, hashes, animation names, and
budgets.

Adding a conforming artist-authored item requires a source GLB and catalog
record, not application code.
