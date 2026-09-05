# ZoomiGo avatar production list

**Status:** Commissioning brief

**Machine-readable source:** [spec/production-assets.json](spec/production-assets.json)

This is the first serious content wave. Class-level triangle, material,
texture, rig, and delivery requirements come from the
[artist handbook](ARTIST_HANDBOOK.md). Every row below inherits its named class
budget and also has an individual design brief and acceptance checks in the
machine-readable source.

Do not commission the entire list at once. Use the foundation gate first; it
proves the approved base, rig, fit, materials, and export loop before wardrobe
production scales.

## Foundation gate — commission first

| ID                         | Piece                  | Type             | Why it comes first                                                          |
| -------------------------- | ---------------------- | ---------------- | --------------------------------------------------------------------------- |
| `base.player-biped-v2`     | Production Player Base | Human base       | Locks proportions, topology, face, rig, regions, sockets, and fit envelopes |
| `face.bright-01`           | Bright                 | Face preset      | Proves the face preset and expression system                                |
| `face.focused-01`          | Focused                | Face preset      | Proves visibly distinct features on the same topology                       |
| `hair.curl-cloud`          | Curl Cloud             | Hair             | Proves head fit and sculpted hair language                                  |
| `hair.wave-crop`           | Wave Crop              | Hair             | Proves close hair and hairline treatment                                    |
| `hair.braided-crown`       | Braided Crown          | Hair             | Proves structured hair detail and LOD                                       |
| `hair.coil-puffs`          | Coil Puffs             | Hair             | Proves a wider silhouette and compatibility tags                            |
| `hair.side-swoop`          | Side Swoop             | Hair             | Proves asymmetric hair                                                      |
| `top.striker-jersey`       | Striker Jersey         | Skinned top      | Golden-path palette garment                                                 |
| `top.training-tee`         | Training Tee           | Skinned top      | Single-tint basic garment                                                   |
| `top.warmup-jacket`        | Breakaway Warmup       | Skinned top      | Long sleeves and collar deformation                                         |
| `bottom.match-shorts`      | Match Shorts           | Skinned bottom   | Golden-path lower-body fit                                                  |
| `bottom.training-shorts`   | Training Shorts        | Skinned bottom   | Alternate hem and volume                                                    |
| `bottom.tapered-joggers`   | Tapered Joggers        | Skinned bottom   | Full-leg coverage and shoe cuffs                                            |
| `socks.match-knee`         | Match Socks            | Skinned socks    | Layering between bottom and footwear                                        |
| `feet.velocity-cleats`     | Velocity Cleats        | Footwear pair    | Ground contact, toe bend, and stud silhouette                               |
| `feet.pitch-runners`       | Pitch Runners          | Footwear pair    | Alternate sole and profile                                                  |
| `headwear.touchline-cap`   | Touchline Cap          | Socket headwear  | Hair hiding and anchor placement                                            |
| `headwear.training-beanie` | Training Beanie        | Socket headwear  | Full hair coverage and family-specific fit                                  |
| `eyewear.sport-frames`     | Sport Frames           | Socket eyewear   | Face anchor and eye clearance                                               |
| `back.training-pack`       | Training Pack          | Socket back item | Torso, hair, and locomotion clearance                                       |
| `held.soccer-ball`         | Match Ball             | Held prop        | Prop grip and animation-event contract                                      |
| `anim.core.idle-default`   | Default Idle           | Animation        | Loop baseline                                                               |
| `anim.core.walk`           | Walk                   | Animation        | In-place low-speed locomotion                                               |
| `anim.core.run`            | Run                    | Animation        | In-place high-speed locomotion                                              |
| `anim.reaction.wave`       | Friendly Wave          | Animation        | Positive one-shot reaction                                                  |
| `anim.reaction.cheer`      | Quick Cheer            | Animation        | Team-safe social expression                                                 |
| `anim.celebration.jump`    | Celebration Jump       | Animation        | Landing and celebration baseline                                            |

The first browser acceptance set is smaller than the whole foundation table:
base, Bright face, Curl Cloud, Striker Jersey, Match Shorts, Velocity Cleats,
Touchline Cap, and idle/walk/run. Approve that set before releasing the rest of
the foundation purchase order.

## Launch variety — commission after rig lock

### Faces

| ID                 | Piece    | Individual visual requirement                   |
| ------------------ | -------- | ----------------------------------------------- |
| `face.cheerful-01` | Cheerful | Rounded eyes and lifted brows                   |
| `face.calm-01`     | Calm     | Gently lowered lids without looking sleepy      |
| `face.bold-01`     | Bold     | Strong curved brows and friendly confidence     |
| `face.playful-01`  | Playful  | Controlled asymmetry using the shared morph set |

All six faces work with all curated skin tones and the same blink, smile,
mouth-open, and surprised expressions.

### Hair

| ID                  | Piece        | Individual visual requirement                     |
| ------------------- | ------------ | ------------------------------------------------- |
| `hair.straight-bob` | Straight Bob | Chin-length mass with shoulder clearance          |
| `hair.short-twists` | Short Twists | Chunky twists and readable parting                |
| `hair.long-braids`  | Long Braids  | Grouped shoulder-length braids without simulation |

Hair colors are curated material variants, not separate geometry. Long hair may
be lightly skinned; short rigid styles use the head socket.

### Tops

| ID                  | Piece             | Individual visual requirement                   |
| ------------------- | ----------------- | ----------------------------------------------- |
| `top.goalkeeper`    | Goalkeeper Shield | Long sleeves and graphic padding                |
| `top.street-hoodie` | Street Hoodie     | Hood down, no cords, backpack clearance         |
| `top.rain-shell`    | Rain Shell        | Matte weather fabric and strong shoulder accent |

### Bottoms and socks

| ID                     | Piece               | Individual visual requirement     |
| ---------------------- | ------------------- | --------------------------------- |
| `bottom.keeper-pants`  | Keeper Pants        | Hip/knee padding and tapered cuff |
| `bottom.street-shorts` | Street Shorts       | Rounded hem and side graphic      |
| `socks.training-crew`  | Training Crew Socks | Mid-calf with broad cuff stripe   |
| `socks.retro-stripe`   | Retro Stripe Socks  | Two large bands that survive LOD1 |

### Footwear

| ID                       | Piece             | Individual visual requirement                 |
| ------------------------ | ----------------- | --------------------------------------------- |
| `feet.indoor-flats`      | Indoor Flats      | Low profile and gum-sole zone                 |
| `feet.high-top-trainers` | High-top Trainers | Padded ankle and bold sole blocks             |
| `feet.recovery-slides`   | Recovery Slides   | Thick sport-slide silhouette; no modeled toes |

### Head, face, back, wrist, and held pieces

| ID                     | Piece               | Class       | Compatibility requirement                                           |
| ---------------------- | ------------------- | ----------- | ------------------------------------------------------------------- |
| `headwear.sprint-band` | Sprint Band         | Headwear    | Coexists with compatible hair                                       |
| `headwear.bucket-hat`  | Sideline Bucket Hat | Headwear    | Hides incompatible hair                                             |
| `eyewear.sun-shield`   | Sun Shield          | Eyewear     | Eyes remain faintly readable                                        |
| `back.ball-net`        | Ball Net            | Back        | No simulation; long-hair conflict is explicit                       |
| `wrist.captain-band`   | Captain Band        | Left wrist  | Works with short sleeves; conflicts declared for tight long sleeves |
| `wrist.training-watch` | Training Watch      | Right wrist | Abstract screen, no numeric performance display                     |
| `held.water-bottle`    | Water Bottle        | Held        | Opaque, unbranded, readable grip                                    |
| `held.training-cone`   | Training Cone       | Held        | Cross-family rigid item                                             |

### Launch animation set

| ID                           | Piece          | Requirement                                 |
| ---------------------------- | -------------- | ------------------------------------------- |
| `anim.core.turn-left`        | Turn Left      | In place; application owns orientation      |
| `anim.core.turn-right`       | Turn Right     | Authored cleanly, not negative-scaled       |
| `anim.idle.ball-tap`         | Ball Tap Idle  | Uses Match Ball and returns to idle exactly |
| `anim.idle.stretch`          | Warmup Stretch | Calm, non-extreme stretch                   |
| `anim.celebration.fist-pump` | Fist Pump      | Positive, non-aggressive gesture            |
| `anim.celebration.spin`      | Victory Spin   | Root orientation restored on final frame    |

## Expansion pieces — hold until the base library is approved

| ID                       | Piece                | Purpose                                                  |
| ------------------------ | -------------------- | -------------------------------------------------------- |
| `headwear.space-helmet`  | Space Striker Helmet | Cross-family themed headwear and controlled transparency |
| `eyewear.arcade-visor`   | Arcade Visor         | Cross-family opaque face accessory                       |
| `back.explorer-roll`     | Explorer Roll        | Cross-family back silhouette                             |
| `held.pennant`           | Team Pennant         | Cross-family team-color prop without text                |
| `outfit.space-striker`   | Space Striker Suit   | Full-body replacement and slot hiding                    |
| `outfit.goalkeeper-hero` | Goalkeeper Hero Suit | Full-body sports costume and deformation stress          |

## Non-human platform proof

This phase proves the architecture; it is not a requirement that every mascot
wear every human item.

| ID                         | Piece               | Requirement                                                                                 |
| -------------------------- | ------------------- | ------------------------------------------------------------------------------------------- |
| `base.mascot-scout-v1`     | Mascot Scout        | Original non-human silhouette, independent rig, semantic motion roles, and declared anchors |
| `mascot.head.antenna-band` | Mascot Antenna Band | Family-only head attachment                                                                 |
| `mascot.back.energy-pack`  | Mascot Energy Pack  | Family-only back attachment                                                                 |

The mascot must support idle, ordinary locomotion, fast locomotion, turning,
positive reaction, and celebration semantics. It may roll, hop, hover, scuttle,
or use another approved movement language. It does not need humanoid legs,
hands, facial topology, tops, bottoms, socks, or shoes.

For each animation row that names both families, commission two animation
deliverables: one on `zoomigo-humanoid-v2` and one on `zoomigo-mascot-v1`.
They share a catalog meaning, not bones or keyframes.

Cross-family candidates in the list—cap, beanie, sport frames, training pack,
soccer ball, training cone, space helmet, arcade visor, explorer roll, and
pennant—must receive an explicit mascot placement and art review. Capability
matching permits the option; it does not automatically approve the fit.

## Definition of done per item

An item is not done when the beauty render is done. It is done when the source
`.blend`, review GLB, textures, manifest, contact sheet, turntable, required
poses, LOD0, LOD1, compatibility declarations, and browser validation are all
accepted.

Use the item ID as the purchase-order line, folder name, manifest ID, and review
label. That makes artist feedback and runtime catalog changes traceable without
renaming files by hand.
