# ZoomiGo avatar artist handbook

**Status:** Artist production contract

**Audience:** Character artists, technical artists, riggers, and animators using Blender

**Runtime delivery:** glTF 2.0 binary (`.glb`)

This is the handoff document for commissioned avatar art. The existing
engineering GLBs prove loading and assembly only. Their mesh quality,
proportions, topology, and materials are not art references and should not be
refined into production assets.

Use [ASSET_PRODUCTION_LIST.md](ASSET_PRODUCTION_LIST.md) for the commissioned
pieces and [spec/production-assets.json](spec/production-assets.json) for the
machine-readable requirements attached to every item. Use
[ART_DIRECTION_VISUAL_REFERENCE_BOARD.md](ART_DIRECTION_VISUAL_REFERENCE_BOARD.md)
for the approved visual direction and pre-production review sequence.

## 1. What the artist receives

Before fitted clothing begins, ZoomiGo and the artist approve and lock one
production family pack. For the first player family that pack is:

```text
zoomigo-humanoid-v2/
  zoomigo-humanoid-v2.blend
  zoomigo-humanoid-v2-reference.glb
  rig.json
  fit-envelope.blend
  pose-library.blend
  material-library.blend
  thumbnails/
```

The artist creates this pack as the first paid foundation deliverable. The
current `zoomigo-humanoid-v1` engineering GLB may be inspected for semantic bone
and socket names, but its rest transforms and geometry are not the production
reference. Do not start a wardrobe against v1.

Once v2 is approved, all human wearables link or append the locked v2 armature.
The armature, rest pose, joint order, socket transforms, body-region names, and
fit envelopes then become immutable for that rig version.

## 2. Art direction

The production target is stylized graphic 3D with a toon-shaded, cel-shaded,
illustrated, or comic-book presentation. Target roughly 4/10 realism, where 1 is
highly stylized and 10 is photorealistic. Favor modeled or sculpted forms with
clear shape design, expressive and funny performance, readable silhouettes,
and strong graphic color separation.

- Design `zoomigo-humanoid-v2` as the first youth-oriented production family
  for the current player use case. Its approximate age read and proportions are
  family-specific, not a permanent ZoomiGo-wide human style requirement.
- Target about 5.25 heads tall with a large expressive head, compact torso,
  slightly enlarged hands, and readable footwear.
- Use appealing asymmetry and broad shape language. Avoid primitive stacks,
  perfect procedural symmetry, bead-like hair, or details that disappear on a
  phone.
- Use graphic eyes, expressive eyebrows, and highly readable mouth shapes.
  Expressions may be funny and exaggerated but never sexualized, aggressive,
  mocking, or winner-over-loser.
- Use clothing construction details selectively: collar shape, seam direction,
  panel breaks, cuffs, hems, soles, and padding should carry the design.
- Avoid readable text, player names, numbers, sponsor logos, flags, or uploaded
  graphics. Approved geometric marks and the ZoomiGo crest zone are allowed.
- Skin tone, face, hair, and clothing options are choices, never ranked
  upgrades. Do not create height, weight, chest, waist, or muscularity variants.

Avoid Bitmoji- or Snapchat-style avatars, soft bubbly 3D, toy-like characters,
chibi proportions, photorealism, realistic child scans, heavy anime styling,
and a full black outline around every edge.

Use selective contour accents for important silhouettes, facial features,
garment overlaps, and major form breaks. Contours must reinforce the illustrated
read without flattening depth or material separation. Do not use a uniform heavy
black outline around every mesh edge. Ignore internal linework too small to
survive normal gameplay review rather than adding complexity for it.

Review art under a neutral studio rig and at these output sizes:

| Review      |                    Size | Purpose                          |
| ----------- | ----------------------: | -------------------------------- |
| Hero        |             1024 × 1024 | Form, materials, and deformation |
| Customizer  |               480 × 640 | Normal player-facing review      |
| Lounge near | 180 px character height | Silhouette and color blocking    |
| Lounge far  |  72 px character height | LOD and identity readability     |

## 3. Families and capabilities

An avatar family is a compatible body, rig, coverage-region, animation, and
attachment contract. A family is not a species flag.

The first family is a youth biped. A future family may be a robot, quadruped,
bird, floating creature, or another mascot. Non-human families do **not** have
to use the humanoid skeleton or pretend to wear human trousers. Each family owns
its own rig and declares only the capabilities it supports.

Shared runtime concepts are semantic:

- `motion.walk` means ordinary low-speed locomotion. A mascot may step, roll,
  scuttle, or hover.
- `held.primary` means the main prop attachment. It need not be a human hand.
- `wear.head` means a stable upper attachment surface. A creature may call the
  underlying node `socket_head`, regardless of its anatomy.
- A catalog item lists compatible families or required capabilities. Unknown
  combinations are rejected rather than guessed from mesh shape.

There is no universal skeleton. Cross-family assets are limited to rigid items
with a reviewed transform for every declared family. Skinned clothing is
normally family-specific.

Future humanoid families may target different ages, heights, builds, and
proportions with their own bodies and rig versions. Do not stretch one body,
skeleton, or wardrobe across every human shape through arbitrary runtime scale.
Within `zoomigo-humanoid-v2`, the locked body, scale, fit envelopes, rig, and
wardrobe contract remain internally consistent.

The production list may assign one semantic animation item to more than one
family. That means one separately authored clip and manifest per family, not one
GLB retargeted at runtime.

## 4. Coordinate and scene contract

The exported GLB contract is:

| Property          | Requirement                                              |
| ----------------- | -------------------------------------------------------- |
| Units             | Meters                                                   |
| Handedness        | Right-handed                                             |
| Up                | `+Y`                                                     |
| Character forward | `+Z`                                                     |
| Character right   | `+X`                                                     |
| Ground            | `Y = 0`                                                  |
| Origin            | Midpoint between ground contacts in the reference stance |
| Root transform    | Translation zero, rotation identity, scale one           |

The bare human base is `1.45 m` from ground to scalp crown in the reference
stance; hair and headwear may extend beyond it. This is one fixed world scale,
not a player-facing height choice. The mascot proof family targets `0.95 m` but
may use a different width, ground-contact pattern, or hover clearance recorded
in its family pack.

In Blender, use Metric units with Unit Scale `1.0`, model upright on Blender
`+Z`, and face Blender `-Y`. Export with **+Y Up** so the resulting GLB faces
`+Z`. Apply mesh transforms before skinning. Never apply or change the locked
armature's rest transform.

No asset may contain cameras, lights, world environments, unsupported custom
shaders, simulation caches, linked external files, or hidden production debris.

## 5. Blender file organization

Use Blender 4.2 LTS or a mutually agreed newer LTS version for a production
wave. Do not change Blender major versions halfway through a family without a
clean export comparison.

Every `.blend` uses these collections:

```text
00_REFERENCE   disabled in render and export
10_RIG         the locked family armature and sockets
20_LOD0        production meshes
21_LOD1        reduced meshes
30_COLLISION   review envelopes only; never exported
40_EXPORT      the explicit export collection
90_NOTES       optional artist notes; never exported
```

Name objects with the stable item ID and purpose:

```text
top.striker-jersey__lod0
top.striker-jersey__lod1
ZG_top_striker_jersey_palette
```

Use lowercase ASCII IDs in files and manifests. Display names may contain spaces
and capitalization. A revision to geometry under the same identity increments
`assetVersion`; a meaningfully different reward receives a new item ID.

### 5.1 GLB export preset

Use Blender's built-in glTF 2.0 exporter with these settings. Save the preset as
`ZoomiGo review GLB` in the agreed Blender LTS version.

| Export setting             | Value                                                            |
| -------------------------- | ---------------------------------------------------------------- |
| Format                     | glTF Binary (`.glb`)                                             |
| Include                    | `40_EXPORT` collection only                                      |
| Custom properties          | On; exported as glTF extras                                      |
| Cameras / punctual lights  | Off                                                              |
| Apply modifiers            | On for the evaluated export mesh                                 |
| UVs / normals / tangents   | On                                                               |
| Loose edges / loose points | Off                                                              |
| Vertex colors              | On only when declared in the manifest                            |
| Materials                  | Export; Principled BSDF only                                     |
| Shape keys                 | On when the approved face implementation uses morph targets      |
| Deformation bones only     | On                                                               |
| Flatten bone hierarchy     | Off                                                              |
| Geometry compression       | Off; the repository pipeline applies Meshopt                     |
| Texture conversion         | Off; provide lossless source textures                            |
| Animation                  | Off for cosmetics; on only for reviewed bases or animation packs |
| Animation sampling         | 30 fps, sample step 1, redundant-key optimization on             |
| Negative frames            | Crop                                                             |
| Force sampling             | On                                                               |
| +Y Up                      | On                                                               |

For an animation pack, export only approved actions with exact clip names.
Do not export every action, NLA scratch track, control-rig action, or pose-library
asset from the file. For a wearable, a static armature may be present for skin
data; do not duplicate the base's animation clips.

### 5.2 Required glTF custom properties

Put these custom properties on the exported item root:

```text
itemId       exact catalog item ID
assetVersion positive integer
familyId     one target family ID
rigVersion   locked rig ID for bases and skinned items
artStatus    artist-wip, technical-review, art-review, or approved
```

Put the applicable properties on exported mesh or attachment nodes:

```text
bodyRegion   exact family region on base-body meshes
skinTintable true only on meshes using the curated skin palette
tintable     true only on tint1 meshes
paletteMask  true only on palette3 meshes
socket       exact socket node for a rigid item's attachment root
```

Do not invent unregistered extras. The manifest carries compatibility and
review notes; glTF extras carry only runtime facts the loader or validator needs.

## 6. Human production rig

The approved `zoomigo-humanoid-v2` rig may contain up to 60 deform bones. It
must preserve these logical bones, in stable order, with `_l` and `_r` referring
to the character's own left and right:

```text
root, hips,
spine_01, spine_02, chest, neck, head,
clavicle_l, upper_arm_l, lower_arm_l, hand_l,
clavicle_r, upper_arm_r, lower_arm_r, hand_r,
upper_leg_l, lower_leg_l, foot_l, toe_l,
upper_leg_r, lower_leg_r, foot_r, toe_r
```

Twist, finger, facial, or helper bones are decided during the base-rig gate and
then frozen. Deform bone names are never reused for sockets. The common rest
pose is a relaxed A-pose with straight fingers, neutral shoulders, parallel
feet, and the gaze along exported `+Z`.

### Skinning rules

- Maximum four non-zero bone influences per vertex.
- Normalize all weights; no unweighted vertices and no weights below `0.01`.
- Remove unused vertex groups and non-deforming control bones from skin data.
- Do not add deform bones to a garment.
- Do not export constraints, drivers, IK controls, or control-rig objects.
- Correct shoulders, crotch, elbows, knees, wrists, cuffs, and hems in the
  required pose set before submission.
- Shape keys are permitted for expression when required by the approved face
  implementation, not as a hidden substitute for broken garment weights.

## 7. Body regions and fit envelopes

The human base mesh is split into named hideable regions:

```text
head_neck
torso
pelvis
upper_arm_l, upper_arm_r
lower_arm_l, lower_arm_r
hand_l, hand_r
upper_leg_l, upper_leg_r
lower_leg_l, lower_leg_r
foot_l, foot_r
```

Region seams sit under normal clothing boundaries. Adjacent regions must meet
without holes in the naked fallback and must not create duplicate surfaces when
visible together. Hands and feet stay separate from lower limbs so long sleeves,
socks, footwear, gloves, and wrist items can compose without removing exposed
skin accidentally.

The locked family pack includes conservative fit envelopes for headwear, hair,
tops, bottoms, cuffs, shoes, backpacks, and held props. Clothing follows the
envelope rather than shrinking the body ad hoc. Every wearable manifest states
the body regions and slots it hides.

## 8. Attachment anchors

Rigid assets use named empty nodes. The human family exposes:

```text
socket_head, socket_face, socket_back, socket_chest,
socket_wrist_l, socket_wrist_r,
socket_hand_l, socket_hand_r,
socket_foot_l, socket_foot_r,
socket_fx_root
```

The item is authored in the family reference scene at the approved final
placement. Before export, its geometry is parented beneath one item-root empty
whose custom property `socket` contains the target socket name. The exported
item root has identity transforms. Do not bake the family armature or reference
body into a rigid-item GLB.

A cross-family rigid asset gets one reviewed placement transform per family.
Scaling one human hat until it roughly fits a mascot does not count as review.
Record those transforms in `familyPlacements` in the submission manifest.

## 9. Geometry and LOD

All triangle limits are hard maxima after triangulation. The authoritative
per-class values live in `spec/production-assets.json`.

| Class             | LOD0 tris | LOD1 tris | Material slots | Texture max |
| ----------------- | --------: | --------: | -------------: | ----------: |
| Human base        |     7,500 |     3,750 |              3 |        1024 |
| Non-human base    |    10,000 |     5,000 |              3 |        1024 |
| Hair              |     1,800 |       900 |              1 |         512 |
| Top               |     2,500 |     1,250 |              1 |        1024 |
| Bottom            |     2,200 |     1,100 |              1 |        1024 |
| Socks             |       700 |       350 |              1 |         512 |
| Footwear pair     |     1,800 |       900 |              1 |         512 |
| Headwear          |     1,200 |       600 |              1 |         512 |
| Eyewear           |       500 |       250 |              2 |         512 |
| Back item         |     1,600 |       800 |              1 |         512 |
| Wrist item        |       300 |       150 |              1 |         256 |
| Held prop         |     1,200 |       600 |              1 |         512 |
| Full-body costume |     7,000 |     3,500 |              2 |        1024 |

LOD1 is artist-authored, not an automatic decimation artifact. Preserve the
outer silhouette, face, hair mass, footwear, major color borders, and prop
identity. Remove interior loops, tiny bevels, hidden faces, micro-seams, and
small accessories first. LOD0 and LOD1 must share the same rest placement,
family contract, material roles, and animation behavior.

The fully equipped LOD0 target remains at most 25,000 visible triangles and
eight draw calls after hidden body regions and compatible geometry are
assembled. The app creates LOD2 team-scene representations later; artists do
not independently invent incompatible far-distance skeletons.

## 10. Materials and textures

Use Blender Principled BSDF only. The pipeline owns final Meshopt and KTX2
conversion.

Allowed source texture sets are:

- base color in sRGB;
- tangent-space normal in non-color data, only where it improves the phone-size
  result;
- packed ORM in non-color data: red ambient occlusion, green roughness, blue
  metallic;
- palette mask in non-color data: red primary, green secondary, blue trim;
- alpha mask only for approved hair cards or cutout details.

Avoid baked lighting, environment reflections, excessive metallic surfaces,
and per-item shader graphs. Prefer modeled broad seams and color blocking over
texture noise. Use alpha blend only for an approved visor or lens; alpha mask is
preferred. Hair should normally use sculpted solid clumps rather than hundreds
of transparent cards.

Material modes:

- `fixed`: authored colors remain fixed;
- `tint1`: one neutral region accepts one curated runtime color;
- `palette3`: RGB mask selects primary, secondary, and trim colors;
- `skin`: uses the curated skin palette and shared face treatment.

## 11. Face and expression contract

The face belongs to the same graphic, illustrated, toon-shaded language as the
body. Use graphic eyes rather than glossy or realistic eyeballs, expressive
eyebrows, and mouth shapes that read clearly at customizer and lounge sizes.
The system must support funny, exaggerated combinations without depending on
realistic facial anatomy.

The exact implementation is a required technical-art decision at the foundation
gate. Evaluate all three approaches in GLB and the real browser runtime:

1. a minimal mesh morph / shape-key system;
2. a graphic feature geometry or material-state system;
3. a hybrid using limited morphs plus graphic eye, brow, and mouth treatments.

Choose the smallest approach that combines cleanly, survives export, meets the
performance budget, and remains readable at hero, customizer, lounge-near, and
lounge-far sizes. Record the decision before locking `zoomigo-humanoid-v2`.

Regardless of technique, the semantic expression contract remains:

```text
blink_l
blink_r
smile
mouth_open
surprised
```

The checked-in submission schema and current runtime are technique-neutral. Any
morph-compatible assets or downstream integrations must preserve these exact
names and `0..1` behavior until a deliberate technical change lands. A
geometry- or material-state proposal must provide an equivalent semantic
mapping and cannot silently break morph-compatible assets.

All face presets share the approved v2 feature placement, combination rules,
teeth/tongue policy, and skin treatment. If the selected system uses shared
topology, UVs, morphs, geometry sets, or material states, those details are
frozen with the family pack. Presets may vary curated eye, brow, nose, and mouth
shapes within the approved style. They must work across every skin tone and must
not be presented as gender, ethnicity, attractiveness, body type, or age
rankings.

Eyes must remain readable at customizer size without relying on emission.
Blink states must close cleanly. `smile` and `mouth_open` must combine without
tearing, visual collisions, collapsed normals, or exposed interior gaps.

## 12. Animation contract

Animations are authored on the locked family rig and delivered in separate
animation GLBs. Each family implements logical roles even if its physical
movement differs.

An animation submission targets exactly one family. A catalog animation ID may
have multiple family-specific source and runtime assets behind it.

- Locomotion clips are in place: root X/Z translation stays zero.
- Looping clips match pose and velocity across the seam.
- One-shot clips begin and end in the documented base pose.
- Root rotation returns to identity unless the clip is explicitly presentation
  only.
- Use 30 fps key timing; remove redundant keys without changing silhouettes.
- Provide prop attach/detach and effect cue frame numbers in the manifest, not
  arbitrary executable behavior.
- Keep reactions positive and readable. Do not create taunts, combat moves,
  sexualized dances, flashing effects, or motion that requires camera shake.

## 13. Required QA poses

The human pose library contains:

```text
a_pose
arms_up
arms_forward
deep_crouch
run_contact_l
run_contact_r
run_flight
goalkeeper_ready
goalkeeper_reach_l
goalkeeper_reach_r
seated_bench
celebration_extreme
```

Review every skinned asset in its listed poses, from front, three-quarter, side,
and back. Acceptance means no visible body penetration, collapsed volume,
exploding normals, open seams, floating hems, or unintended ground contact.

Rigid items additionally run anchor clearance through idle, walk, run, turn,
wave, and celebration. Props used by a dedicated animation are reviewed in that
clip.

## 14. Submission package

One item version is delivered as:

```text
<asset-id>/v<version>/
  source/<asset-id>.blend
  textures/<source textures>
  review/<asset-id>.glb
  review/contact-sheet.png
  review/turntable.mp4
  review/diagnostics/<weight and topology captures>
  asset.json
```

The `.blend` must be editable and self-contained. Pack linked resources or use
repository-relative paths. Do not flatten modifiers needed for reasonable
revision work, but ensure the export collection produces the exact review GLB.

The asset manifest follows
[spec/avatar-asset.schema.json](spec/avatar-asset.schema.json). Begin with the
[human wearable example](spec/examples/humanoid-wearable.example.json) or the
[non-human base example](spec/examples/non-humanoid-base.example.json). Use the
[cross-family headwear example](spec/examples/cross-family-headwear.example.json)
when one rigid item has separately reviewed placements for multiple families.

Validate the production list and the provided examples with:

```text
pnpm avatar:spec:validate
```

Validate a submitted manifest with:

```text
pnpm avatar:spec:validate path/to/asset.json
```

## 15. Acceptance gates

An asset is accepted only when all four gates pass:

1. **Art:** silhouette, construction, palette, audience appropriateness, and visual
   polish are approved at phone size.
2. **Technical:** naming, scale, transforms, topology, UVs, skinning, materials,
   animations, and manifest pass the validator.
3. **Combination:** the asset passes its required poses and the catalog's
   declared compatibility combinations without clipping.
4. **Runtime:** the optimized output loads in the real browser demo, degrades
   safely, and stays inside equipped-avatar performance budgets.

Artist approval is not replaced by an automated green check. Likewise, a
beautiful render is not accepted if it cannot be equipped, animated, and
shipped within the contract.

## 16. Foundation sequence

To avoid paying for work against a moving target:

1. complete the visual-development workflow and approve one style direction;
2. approve the blockout, turnaround, phone-size reads, topology, face-system
   decision, expressions, contours, and neutral materials;
3. build and test the production rig, sockets, regions, envelopes, and pose
   library;
4. lock `zoomigo-humanoid-v2`;
5. produce one jersey, one short, one shoe, one hair, and one rigid hat;
6. validate those five assets through the browser pipeline;
7. start the remaining launch wardrobe;
8. produce the non-human proof family after the shared capability seam is
   validated.

Any change to bone rest transforms after step 4 creates a new rig version and
requires deliberate garment migration. It is cheaper to spend extra review
time at the foundation gate.
