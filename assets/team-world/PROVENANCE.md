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
