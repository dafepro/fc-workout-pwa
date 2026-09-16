# Campus ownership and follow-up decisions

**Status:** Decision register — September 16, 2026. These are qualification and
design follow-ups, not promises of additional player features.

## Current split

| System         | Owns                                                                                                              | Consumed by Zoomigo                                         |
| -------------- | ----------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------- |
| ZMap           | Deterministic world simulation, relay protocol, geometry navigation, object behaviors and basic Three.js view     | Pinned `zmap` 0.1.4 release, identically in app and relay   |
| Avatar Studio  | Modular characters, animation, comic presentation and wielded equipment                                           | Pinned `@zmap/avatar-studio` 0.1.2 release                  |
| fc-workout-pwa | Eligibility, identity, tickets, transient room policy, campus terrain/art, input UI and action-to-avatar adapters | App-owned `world.json`, Blender sources and scenery adapter |

The campus uses public package contracts. No engine or character source fork is
needed. The older local ZMap independence-review branch is not the runtime
consumed by this app. Upstream's development avatar submodule is a development
relationship; the app consumes independent release artifacts.

## Current map contract

Five overlapping 54 m districts form a connected campus along the isometric
camera's horizontal axis, within 142 × 142 m world bounds. The walkable footprint
projects to about 201 m horizontally and 49 m vertically with ZMap's existing
camera angle. At 1440 × 900, zoom 1, that is approximately 6.3 × 2.45 viewports;
phone aspect ratios show different fractions. This measures ground extent, not
the extra height of tree crowns or a fit-entire-map review camera.

The campus has two lined pitches, three furnished raised terraces, three ramps,
a bridge/underpass and picnic/warm-up areas. Surface heights and solid furniture
envelopes are generated with the art. Existing cannon, lamp, balls, approved
tools, emotes and room access rules are preserved. There are no durable placement
zones, score authority, new rewards or freeform communication.

## Follow-ups

- [ ] **ZMap view API — before adding more overhead architecture:** design a
      public surface-visual replacement and occlusion contract. The engine can fade
      its base slabs, while app-owned textured caps/furniture do not yet share that
      fade. A player under a terrace can be occluded. Decide whether to fade roofs,
      cut away an entire structure, or constrain future interiors. Keep this generic
      in ZMap and author structure membership in consumer content.
- [ ] **Navigation — before distant destinations or larger worlds:** define a
      coarse district route graph and cancellable fine search. The app now samples
      only an 8 m margin around a requested trip, at 0.8 m spacing with ZMap's hard
      100,000-node budget. This supports nearby taps and avoids sampling all 142 m,
      but cannot promise every detour that leaves that local search window.
- [ ] **Mobile qualification — before rollout:** measure cold loading, GPU memory,
      frame pacing and context loss on representative low-end Android/iOS devices.
      A desktop Chrome pass and the 1.5-million-pixel raster cap do not establish
      phone performance. Decide whether texture compression or district streaming is
      warranted from measurements. Keep Three.js versions aligned across packages.
- [ ] **Asset pipeline — before more maps:** extract a consumer-neutral manifest
      schema for visual/collision pairing, source attribution, mesh/texture budgets
      and Blender reproducibility. Keep this campus's layout in the app. Add CI
      regeneration comparison if Blender becomes a supported build dependency.
- [ ] **Avatar Studio — before more seating interactions:** standardize seated
      anchors and attachment offsets against actual body variants; benches here are
      scenery, not a new shared sitting action. Preserve the current approved
      appearance policy until a saved-recipe product contract is decided.
- [ ] **Release coordination — before shared deployment:** ship client and relay
      from the same map revision and restart transient rooms together. Static asset
      publication alone would leave old relay collisions. Use a new asset path when
      the campus version changes. The old demo map and new map cannot coexist in one
      room authority.

Reproduction, sources and generated prompts are in
[`assets/team-world/campus/PROVENANCE.md`](../assets/team-world/campus/PROVENANCE.md).
