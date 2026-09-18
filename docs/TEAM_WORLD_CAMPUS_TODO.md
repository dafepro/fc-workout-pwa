# Campus ownership and follow-up decisions

**Status:** Decision register — September 17, 2026. These are qualification and
design follow-ups, not promises of additional player features.

## Current split

| System         | Owns                                                                                                              | Consumed by Zoomigo                                         |
| -------------- | ----------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------- |
| ZMap           | Deterministic world simulation, relay protocol, geometry navigation, object behaviors and basic Three.js view     | Pinned `zmap` 0.1.7 preview, identically in app and relay   |
| Avatar Studio  | Modular characters, animation, comic presentation and wielded equipment                                           | Pinned `@zmap/avatar-studio` 0.1.2 release                  |
| fc-workout-pwa | Eligibility, identity, tickets, transient room policy, campus terrain/art, input UI and action-to-avatar adapters | App-owned `world.json`, Blender sources and scenery adapter |

The campus uses public package contracts. ZMap 0.1.5 adds the reusable settled-step
object hook and stencil buffer; soccer rules and silhouette presentation remain
app-owned. Version 0.1.7 adds bounded kick pose timing through prediction,
interpolation, relay snapshots and late join; the app animates Avatar Studio
sockets through its public attachment view. No character source fork is needed. The older local ZMap independence-review branch is not the runtime
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

- [ ] **Intermittent sprint ghosting — reproduce on the affected device:** desktop
      Chrome on NVIDIA RTX 3070 passed a 120-frame sprint render comparison and
      recorded connected movement/turns as host and second player, including bridge
      entry/exit. Sampled frame pacing was about 18 ms (p50/p95), without a duplicate
      mesh or sustained stall. Antialiasing produced tiny pixel differences in exact
      hashes; disabling it in the diagnostic made repeated renders identical.
      The same connected sprint check also passed with an ordered message proxy
      adding 75 ms each way and ±30 ms jitter (E2E_SPRINT_JITTER=1). No speculative
      animation/rendering fix was applied. Obtain the affected browser/device and
      route before claiming this intermittent issue fixed.

- [ ] **Shared-dev browser reliability — before rollout:** investigate ZMap's
      host-health recovery loop under software rendering. The September 17 update
      deployed `34603f1ba0702741b19e23f51c800fd9902c45cd`; API and relay are healthy.
      The gated campus, goal and scoreboard GLBs match local SHA-256. Clean install,
      all app/relay tests, build, both API modes, exact-revision and Lounge checks
      passed in [run 35306329446](https://github.com/dafepro/fc-workout-pwa/actions/runs/35306329446).
      Its SwiftShader Team World check failed at entry: tick 0, no eligible host,
      2.283-second maximum frame, 26 frames above 250 ms and a 1.736-second long task.
      The aggregate workflow is failed; the same entry failure affected earlier
      revisions. Live hardware Chrome passed the deployed two-player check in
      16.5 seconds, including shared kick pose, presence, lamp synchronization,
      movement, equipment, emotes and departure. Local validation passed 532 app
      tests, nine relay tests, 13 browser checks and an additional jittered sprint
      check. Formatting, lint, typecheck, production build and the 2243.41 KiB Worker
      budget check passed. Dev data was preserved; no fixture reset ran.
      Physical phones and software rendering remain unqualified. Profile the extra
      silhouette depth passes and evaluate projected avatar regions before rollout.
- [ ] **ZMap view API — before more rendering integrations:** standardize optional
      depth-aware character presentation and explicit terrain material ownership.
      The campus no longer captures BoxGeometry or clips slabs; its character-only
      terrain-depth-tested mask composite keeps roofs intact. Benchmark its two depth targets and extra passes
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

## Rendering diagnostics (development only)

- [x] Add live controls and normal/minimal presets for user-assisted ghosting
      isolation, including capsule avatars, material overrides, silhouette bypass,
      comic/outline toggles, reduced-motion poses, hidden campus art, frozen camera
      and raster scaling. Persist local settings and export a credential-free report.
- [ ] Collect good/bad reports on the affected device; isolate the responsible
      rendering or presentation stage before claiming the sprint artifact is fixed.
