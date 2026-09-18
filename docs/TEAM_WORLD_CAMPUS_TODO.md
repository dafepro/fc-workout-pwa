# Campus ownership and follow-up decisions

**Status:** Decision register — September 17, 2026. These are qualification and
design follow-ups, not promises of additional player features.

## Current split

| System         | Owns                                                                                                              | Consumed by Zoomigo                                         |
| -------------- | ----------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------- |
| ZMap           | Deterministic world simulation, relay protocol, geometry navigation, object behaviors and basic Three.js view     | Pinned `zmap` 0.1.9 preview, identically in app and relay   |
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

Validated and deployed diagnostics revision `00526e8e2e9971687d4cc84b442448a66155d963`
on 2026-09-18. Application tests (532), relay tests (9), all 14 targeted browser
cases (including corrected layout reruns), formatting, lint, types, build and
2244.30 KiB upload budget passed. Hardware Chrome verified deployed two-player
entry, diagnostics presets, shared kicks and interactions in 17.6 seconds; dev
API/relay containers are healthy at that revision and fixture data was preserved.
[Deployment run](https://github.com/dafepro/fc-workout-pwa/actions/runs/35340912368)
completed the update and exact-revision checks but failed the existing SwiftShader
world-entry qualification: tick 0, no eligible host, maximum frame 1817 ms and
longest task 1393 ms. Overall release CI remains red; physical-phone and software
rendering qualification remain open. This release provides isolation tools and
does not claim to fix the reported sprint ghosting.

## Timing investigation (2026-09-18)

The basic-rendering report led to a reproducible scheduler defect: a delayed
simulation timer exhausts the interpolation interval while RAF keeps presenting.
In a real campus sprint with 45 ms added to every fifth timer, the old engine
repeated a moving position in 36 of 74 frames. ZMap 0.1.8 drains due fixed steps
before drawing, sharing the timer's accumulator without changing the physics rate.
The corrected campus trace has zero held steady-motion frames; independent engine
before/after was 26 holds versus zero. Seven engine and fifteen campus browser
checks pass. This reproduces a real timing defect but does not establish that every
artifact on the reported physical device has the same cause.

Dev diagnostics now retain a bounded numeric ten-second trace and offer a download
plus an independent composited reference bar. Collect affected-device captures if
artifacts persist, then compare displayed and predicted motion, camera projection,
frame gaps and long tasks. Physical display response requires external observation;
browser pose data alone cannot prove or disprove panel ghosting.

The owner approved publication and dev deployment. The immutable ZMap 0.1.8
prerelease is published at engine commit `7465e61`; app and relay pin the same
release artifact. Local validation passed 532 app tests, 9 relay tests, types, lint,
formatting and the production build (2244.43 KiB compressed upload). Deployment
verification follows the update; physical-device confirmation remains open.

Deployed app revision `a3aa7c2b25fbb98d2a731334b5e40b369851609b` with ZMap 0.1.8
on 2026-09-18. Published-package build and upload check passed at 2244.52 KiB.
[Release workflow](https://github.com/dafepro/fc-workout-pwa/actions/runs/35345401056)
passed application/API/build, image startup, exact-container and Lounge checks;
API and relay are healthy at the deployed revision, and no fixture reset ran.
Hardware Chrome passed the deployed two-player movement, shared kick/interaction,
diagnostics preset and numeric motion-capture checks in 16.5 seconds.

Overall workflow remains red at SwiftShader world entry: tick 6, epoch 8, no
eligible host at failure, maximum frame 1817 ms, longest task 1306 ms. This remains
an open software-renderer qualification issue; the successful hardware check does
not establish software-renderer or physical-phone readiness.

## Running-shot refinement — September 18

Kick now fires on pointer press without taking canvas focus, preserving keyboard
and joystick movement. Its right-side placement supports steering with one thumb
and shooting with the other; compatibility clicks do not trigger a second shot.
Real Chrome two-touch dispatch confirms that releasing the kick finger leaves the
steering finger active, and releasing steering stops movement.

The app pose has a farther backswing, hip/chest extension, a slower build-up,
accelerated strike, stronger follow-through, and shooting-foot landing. The
0.96-second clip blends back into the active running/idle pose. Campus opts into
ZMap 0.1.9's `kickWindup: 0.2`, so shared ball contact matches the visual strike
rather than preceding the wind-up. Reach is checked at contact. Walking, sprinting
and steering remain live. Repeated presses cannot indefinitely postpone a pending
shot, and the existing shared timer preserves contact across host restoration.
Other maps keep immediate kicks; enabled rooms require `kick-windup-v1` on client
and service. Avatar Studio remains independently pinned at 0.1.2.

Published engine revision `415e06653b4f1e535458f8001ae546553da7af2f`; artifact
SHA256 `800c4e94e48e8e786b6e4a9ca0b5f645693ae5ac2857f832400bb0e0ce11c68b`.
Engine types/build/packed consumer and all new timing/socket tests passed; 114/119
Windows tests pass, with the same five existing directory-fsync/storage failures.

Local integration validation passed 21 Chrome checks (standing/running poses,
reduced motion, two-finger sprint/kick/release, keyboard movement with button kick,
shared scoring, silhouettes and sprint scheduling), all 532 app tests, 9 relay
contracts, types, lint, formatting and deployment contracts. The production build
and upload dry run passed at 2246.13 KiB compressed. Physical phone testing remains
open; full Docker/VM suites were not rerun for this refinement.

The coaching source and generated six-pose art guide remain documented in
`assets/team-world/PROVENANCE.md`. The real-rig developer review supports front,
right-side and rear-three-quarter contact sheets plus four selectable playback
angles at normal/slow speed; `?moving=1` previews the running shot.

The actual-model multi-angle refinement uses four direct Avatar Studio model
renders as inputs to both generated pose sheets in `assets/team-world/kick-study-v3/`.
The rig has a more tucked heel, longer follow-through and supporting-foot toe-off.
Shape-preserving Hermite joint curves replace stop/start easing at every key.
The actual-rig contact-velocity regression failed before the change and passes
afterward; three appearances, running and reduced-motion pose checks also pass.
The shared 0.2-second contact time and package versions remain unchanged.
This refinement passes 22 targeted Chrome checks, 532 app tests, 9 relay tests,
types, lint, formatting and deployment contracts. Production build and upload
dry run pass at 2246.32 KiB compressed. Physical-phone and software-renderer
qualification remain open.

Deployed app `9e0f027f375de317971c8626d31c277f514601c3` with ZMap 0.1.9 via
[deployment run](https://github.com/dafepro/fc-workout-pwa/actions/runs/35361863462).
Application/API/build/image-startup/exact-container/Lounge checks passed. The API
and relay are healthy at that revision; fixtures were not reset. Hardware Chrome
passed the deployed two-player check in 18.9 seconds, including a peer-visible
kick while the shooter continues moving and retains canvas focus.

CI remains red before gameplay in SwiftShader world entry (tick 0, epoch 2, no
eligible host; maximum frame 1933 ms, longest task 1375 ms). This is the existing
software-renderer qualification gap, not a fully green release workflow.
