# Campus ownership and qualification

**Status:** Maintained — current development campus, not pilot-qualified.

## Current split

| Owner         | Responsibility                                                                     | Consumed version                      |
| ------------- | ---------------------------------------------------------------------------------- | ------------------------------------- |
| Zoomigo       | Identity/access, campus/soccer policy, inventory/rewards and durable persistence   | Current app candidate                 |
| Zoomap        | Reusable simulation, relay, geometry navigation, behaviors and Three.js view       | `zmap` 0.1.11, identical in app/relay |
| Avatar Studio | Modular characters, animation, comic presentation and public equipment attachments | `@zmap/avatar-studio` 0.1.4           |

Public packages supply reusable mechanics. Soccer rules, silhouette presentation
and content stay app-owned. No runtime engine/character fork is consumed. Upstream
development submodules are not this application's runtime dependency graph.

## Current map contract

Five overlapping 54m districts form a connected campus in 142 × 142m bounds.
The walkable footprint projects to roughly 201m horizontally and 49m vertically
with the existing isometric camera; at 1440 × 900, zoom 1, about 6.3 × 2.45
viewports. Phone aspect ratios differ. Ground extent is not tree-crown height or
a fit-entire-map camera.

Two pitches, three raised terraces, ramps, bridge/underpass and picnic/warm-up
areas have paired physical surfaces/furniture. Scores, balls, cannon, lamp,
approved tools and expressions are transient play state. There are no durable
placement zones, new reward rules or free-form communication. Map art is
`campus-v2`; Avatar Studio art uses `/team-world-assets/v0.1.4/`.
Client/relay map and behaviors must ship together; static publication alone cannot
update relay collisions. Rooms must not mix incompatible maps.

[Campus provenance](../assets/team-world/campus/PROVENANCE.md) records sources,
licenses, generated prompts and Blender rebuild. [TEAM_WORLD.md](TEAM_WORLD.md)
describes current controls, rendering and authority.

## Retained regression and diagnostics

The delayed simulation-timer defect was reproduced with 45ms added to every fifth
timer: 36 of 74 moving frames held position before the fix. Zoomap 0.1.8 drained
due fixed steps before drawing; the corrected campus trace had zero holds and an
independent engine trace changed 26 holds to zero. Current packages retain this
fix. It does not prove every reported physical-display artifact has that cause.

Dev controls expose capsule avatars, material overrides, silhouette/comic/outline
bypass, reduced-motion poses, hidden campus, frozen camera and raster scale.
Settings and a bounded ten-second numeric motion report remain local; no
credential or private training data is exported. Collect good/bad affected-device
reports and compare predicted/displayed movement, frame gaps and long tasks.
Physical panel response also requires external observation.

## Active follow-ups

The single prioritized dependency ledger is [ROADMAP.md](ROADMAP.md).

- D04/D06: named physical-device cold/warm/full-room/soak qualification and
  affected-device motion reproduction. Historical hardware Chrome passes do not
  close software-renderer host-health failures or qualify Android/iOS.
- D05: measure required loading, isolate optional-art failure, test graphics loss
  and asset coherence; optimize only demonstrated bottlenecks.
- D12: API/relay restart, authority outage, revocation, host suspension, rejoin and
  synchronized rollout. Process health alone is insufficient.
- D18: consumer-neutral visual/collision/provenance/budget manifest and repeatable
  Blender exports before content expansion. Benchmark silhouette's two depth
  targets/extra passes on slower phones before making them a reusable default.
- D14–D17: inventory applicability, durable layout before placement controls and
  approved saved appearance. Current outfits remain separate from saved portraits.
- D19/D20: explicit travel/map-change scope and complete acceptance ledger.

Nearby paths use an 8m margin, 0.8m sampling and Zoomap's 100,000-node limit.
A district graph activates on reproduced detours outside that window or distant
travel; the large campus alone is not a reason to add another navigation system.
Seated anchors/attachment offsets activate when seating interactions are approved.
