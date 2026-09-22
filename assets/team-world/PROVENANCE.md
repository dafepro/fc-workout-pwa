# Team World content

Consumer map, character animation mapping, navigation UI and cannon presentation
adapted from `dafepro/zmap` at `331ef14`. They use the public zmap and Avatar
Studio contracts; no engine or avatar runtime source is forked here.

`ball-cannon.glb` is the approved Zoomigo/Zoomap cannon from
`zmap/examples/hub/public/models/ball-cannon.glb`. Editable Blender sources,
concept references and workflow remain in that repository. Runtime avatar,
equipment and animation assets are supplied by the pinned Avatar Studio release;
its package includes source licenses and provenance.

The courtyard lamp is the unmodified CC0 Kenney Furniture Kit model documented
in [kenney/PROVENANCE.md](kenney/PROVENANCE.md). The preparation script copies
this approved local source into the public asset directory.

## Instep shot reference

`kick-reference.png` was generated with OpenAI image generation on September 18,
2026 as a six-pose art reference (plant, strike, follow-through, flight,
right-foot landing, recovery). It is not motion capture and is not a runtime asset.
The coaching reference is [Arlington Soccer Club: How to coach shooting](https://www.arlingtonsoccerclub.org/how-to-coach-shooting/),
which reproduces the US Youth Soccer Skills School instep-drive guidance:
plant beside the ball, turn through the strike, counterbalance with the opposite
arm and finish forward on the shooting foot. The app-authored bone animation uses
Avatar Studio's public attachment view, with actual fitted boot contact and a
bounded return to locomotion. No third-party animation clip was downloaded.

## Actual-model multi-angle study

`kick-study-v3/` contains four direct renders of the pinned Avatar Studio 0.1.2
avatar (`model-front`, `model-side`, `model-rear`, `model-three-quarter`). All four
PNG files were passed directly to the built-in OpenAI image-generation tool on
September 18, 2026 for each of the two generated sheets: `backswing-contact.png`
and `follow-landing.png`. Their exact prompts are the adjacent `.prompt.txt`
files. No CLI image generator or external animation asset was used.

These are pose-design references, not motion capture or exact multi-view
reconstructions. The first sheet has dark labels and the generated front views
mirror the runtime rig's named shooting side; fit the silhouette and weight
transfer to the existing rig rather than copying that inconsistency. Actual
runtime front/side/rear review verifies the tucked heel, long striking leg,
toe-off, bent-knee shooting-foot landing and return to locomotion. The fitted
boots determine ground contact. Bounded Hermite curves preserve joint momentum
through contact without overshooting joint targets. These authoring images are
not shipped as runtime map or character assets.

## Header and bicycle studies

See [aerial-study-v1/PROVENANCE.md](aerial-study-v1/PROVENANCE.md) for the actual-rig
reference inputs, generated pose sheet, coaching references and animation workflow.
These app-authored clips use public Avatar Studio bones; no external animation
asset or library/platform upgrade was required.
