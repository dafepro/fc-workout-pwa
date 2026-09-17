# Campus ownership and follow-up decisions

**Status:** Decision register — September 16, 2026. These are qualification and
design follow-ups, not promises of additional player features.

## Current split

| System         | Owns                                                                                                              | Consumed by Zoomigo                                         |
| -------------- | ----------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------- |
| ZMap           | Deterministic world simulation, relay protocol, geometry navigation, object behaviors and basic Three.js view     | Pinned `zmap` 0.1.5 preview, identically in app and relay   |
| Avatar Studio  | Modular characters, animation, comic presentation and wielded equipment                                           | Pinned `@zmap/avatar-studio` 0.1.2 release                  |
| fc-workout-pwa | Eligibility, identity, tickets, transient room policy, campus terrain/art, input UI and action-to-avatar adapters | App-owned `world.json`, Blender sources and scenery adapter |

The campus uses public package contracts. ZMap 0.1.5 adds the reusable settled-step
object hook and stencil buffer; soccer rules and silhouette presentation remain
app-owned. No character source fork is needed. The older local ZMap independence-review branch is not the runtime
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
zones, durable competitive scores, new rewards or freeform communication. Pitch
scores use the shared transient room state.

## Follow-ups

- [ ] **Shared-dev browser reliability — before rollout:** investigate ZMap's
      host-health recovery loop under software rendering. The September 16 update
      deployed `e8e10739d7e05691d4d29e5e3707130106a0bdfb`; API and relay images are
      healthy and the gated campus GLB matches the local SHA-256. Build, app/relay
      tests, both API build modes, exact-revision and Lounge checks passed in
      [run 35166056988](https://github.com/dafepro/fc-workout-pwa/actions/runs/35166056988).
      Its SwiftShader Team World check failed at entry: tick 0, no eligible host,
      2.2-second maximum frame and a 1.7-second long task. The aggregate workflow
      is failed. Hardware Chrome passed the full deployed two-player check in
      16.7 seconds (presence, lamp synchronization, movement, equipment, emotes
      and departure). This does not qualify software rendering or physical phones.
      Dev data was preserved; update skipped fixture reset. No health threshold or
      test assertion was relaxed. The earlier `8cd89d7` update had the same gate
      failure, so this remains a tracked reliability issue.
- [ ] **ZMap view API — before more rendering integrations:** standardize optional
      depth-aware character presentation and explicit terrain material ownership.
      The campus no longer captures BoxGeometry or clips slabs; its character-only
      stencil treatment keeps roofs intact. Benchmark the extra character passes
      on low-end phones before considering this a reusable default.
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
