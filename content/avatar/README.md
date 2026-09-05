# Avatar content pipeline

The isolated 3D avatar demo consumes the compiled engineering catalog. It does
not read the authoring files directly and is not connected to saved player
avatars.

## Source contract

- `engineering-library.json` owns stable item IDs, slots, compatibility,
  variants, and source-file paths.
- `source/**/*.glb` contains reviewable authoring exports. Each skinned garment
  uses `zoomigo-humanoid-v1`; rigid pieces declare one supported socket.
- `art-direction/zoomigo-player-turnaround-v1.png` is the visual target for this
  catalog generation.

The checked-in engineering sources are created with the repository's art
builder because Blender is not available in the automation environment. A
future Blender export replaces a source GLB at the same pipeline seam; the
runtime and catalog compiler do not change.

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
