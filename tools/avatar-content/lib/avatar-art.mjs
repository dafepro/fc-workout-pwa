import {
  AnimationClip,
  BoxGeometry,
  CapsuleGeometry,
  CircleGeometry,
  Color,
  CylinderGeometry,
  Group,
  Mesh,
  MeshStandardMaterial,
  Quaternion,
  QuaternionKeyframeTrack,
  SphereGeometry,
  TorusGeometry,
  Vector3,
  VectorKeyframeTrack,
} from "three";
import { RoundedBoxGeometry } from "three/addons/geometries/RoundedBoxGeometry.js";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";

import {
  RIG_VERSION,
  addSkinnedPart,
  createCanonicalRig,
} from "./avatar-rig.mjs";

const INK = "#14223d";
const NAVY = "#17376f";
const LIME = "#c8f52a";
const VIOLET = "#6548c8";
const WHITE = "#f7f7ef";
const NEUTRAL = "#d9dde4";
const SKIN = "#9a603d";

export function createArtwork(item) {
  switch (item.art.recipe) {
    case "base":
      return createBase(item);
    case "hair":
      return createHair(item);
    case "top":
      return createTop(item);
    case "bottom":
      return createBottom(item);
    case "feet":
      return createFeet(item);
    case "headwear":
      return createHeadwear(item);
    case "eyewear":
      return createEyewear(item);
    case "back":
      return createBack(item);
    default:
      throw new Error(`Unknown avatar art recipe ${item.art.recipe}`);
  }
}

function createBase(item) {
  const root = assetRoot(item, "ZoomigoAvatar");
  const rig = createCanonicalRig(root);
  const skin = material(SKIN, { roughness: 0.72 });
  const undershirt = material(VIOLET, { roughness: 0.88 });
  const undershorts = material(NAVY, { roughness: 0.86 });
  const sock = material(WHITE, { roughness: 0.9 });

  addSkinnedPart(root, rig, {
    name: "body.torso",
    geometry: placed(roundedBox(0.8, 0.96, 0.42, 0.14), {
      position: [0, 2.12, 0],
    }),
    material: undershirt,
    boneName: "spine_02",
    userData: { bodyRegion: "torso" },
  });
  bodyCapsule(
    root,
    rig,
    "body.upper-arm-l",
    "upper_arm_l",
    "upper_arm_l",
    [-0.4, 2.5, 0],
    [-0.88, 2.4, 0],
    0.145,
    skin,
  );
  bodyCapsule(
    root,
    rig,
    "body.lower-arm-l",
    "lower_arm_l",
    "lower_arm_hand_l",
    [-0.84, 2.41, 0],
    [-1.25, 2.31, 0],
    0.12,
    skin,
  );
  bodyCapsule(
    root,
    rig,
    "body.upper-arm-r",
    "upper_arm_r",
    "upper_arm_r",
    [0.4, 2.5, 0],
    [0.88, 2.4, 0],
    0.145,
    skin,
  );
  bodyCapsule(
    root,
    rig,
    "body.lower-arm-r",
    "lower_arm_r",
    "lower_arm_hand_r",
    [0.84, 2.41, 0],
    [1.25, 2.31, 0],
    0.12,
    skin,
  );
  bodyCapsule(
    root,
    rig,
    "body.upper-leg-l",
    "upper_leg_l",
    "upper_leg_l",
    [-0.21, 1.5, 0],
    [-0.21, 0.94, 0],
    0.16,
    undershorts,
    false,
  );
  bodyCapsule(
    root,
    rig,
    "body.upper-leg-r",
    "upper_leg_r",
    "upper_leg_r",
    [0.21, 1.5, 0],
    [0.21, 0.94, 0],
    0.16,
    undershorts,
    false,
  );
  bodyCapsule(
    root,
    rig,
    "body.lower-leg-l",
    "lower_leg_l",
    "lower_leg_foot_l",
    [-0.21, 0.94, 0],
    [-0.21, 0.38, 0.04],
    0.135,
    skin,
  );
  bodyCapsule(
    root,
    rig,
    "body.lower-leg-r",
    "lower_leg_r",
    "lower_leg_foot_r",
    [0.21, 0.94, 0],
    [0.21, 0.38, 0.04],
    0.135,
    skin,
  );

  addSkinnedPart(root, rig, {
    name: "body.hand-l",
    geometry: placed(new SphereGeometry(0.13, 18, 12), {
      position: [-1.33, 2.29, 0],
      scale: [0.8, 1.05, 0.72],
    }),
    material: skin,
    boneName: "hand_l",
    userData: { bodyRegion: "lower_arm_hand_l", skinTintable: true },
  });
  addSkinnedPart(root, rig, {
    name: "body.hand-r",
    geometry: placed(new SphereGeometry(0.13, 18, 12), {
      position: [1.33, 2.29, 0],
      scale: [0.8, 1.05, 0.72],
    }),
    material: skin,
    boneName: "hand_r",
    userData: { bodyRegion: "lower_arm_hand_r", skinTintable: true },
  });

  for (const side of [-1, 1]) {
    addSkinnedPart(root, rig, {
      name: `body.sock-${side < 0 ? "l" : "r"}`,
      geometry: placed(new CylinderGeometry(0.145, 0.13, 0.27, 16), {
        position: [side * 0.21, 0.45, 0.03],
      }),
      material: sock,
      boneName: side < 0 ? "lower_leg_l" : "lower_leg_r",
      userData: {
        bodyRegion: side < 0 ? "lower_leg_foot_l" : "lower_leg_foot_r",
      },
    });
  }

  const head = rig.bones.head;
  rigidPart(
    head,
    placed(new SphereGeometry(0.37, 32, 22), {
      position: [0, 0.16, 0],
      scale: [0.94, 1.04, 0.91],
    }),
    skin,
    "body.head",
    { bodyRegion: "head_neck", skinTintable: true },
  );
  rigidPart(
    rig.bones.neck,
    placed(new CylinderGeometry(0.12, 0.14, 0.34, 18), {
      position: [0, 0.1, 0],
    }),
    skin,
    "body.neck",
    { bodyRegion: "head_neck", skinTintable: true },
  );
  for (const side of [-1, 1]) {
    rigidPart(
      head,
      placed(new SphereGeometry(0.09, 18, 12), {
        position: [side * 0.36, 0.15, 0],
        scale: [0.55, 1, 0.62],
      }),
      skin,
      `face.ear-${side < 0 ? "l" : "r"}`,
      { skinTintable: true },
    );
  }
  addFace(head);
  addFallbackFeet(rig, sock);

  return {
    scene: root,
    animations: createAnimations(),
  };
}

function addFace(head) {
  const white = material("#fffdf7", { roughness: 0.65 });
  const iris = material("#7b481f", { roughness: 0.5 });
  const pupil = material("#121522", { roughness: 0.42 });
  const highlight = material("#ffffff", { roughness: 0.35 });
  const brow = material("#39261e", { roughness: 0.9 });
  const mouth = material("#653b35", { roughness: 0.8 });
  const blush = material("#d9826e", { roughness: 0.9 });

  for (const side of [-1, 1]) {
    rigidPart(
      head,
      placed(new SphereGeometry(0.082, 20, 14), {
        position: [side * 0.135, 0.2, 0.325],
        scale: [0.88, 1.08, 0.48],
      }),
      white,
      `face.eye-white-${side < 0 ? "l" : "r"}`,
    );
    rigidPart(
      head,
      placed(new SphereGeometry(0.048, 18, 12), {
        position: [side * 0.135, 0.198, 0.376],
        scale: [0.82, 1, 0.38],
      }),
      iris,
      `face.iris-${side < 0 ? "l" : "r"}`,
    );
    rigidPart(
      head,
      placed(new SphereGeometry(0.027, 14, 10), {
        position: [side * 0.135, 0.198, 0.405],
      }),
      pupil,
      `face.pupil-${side < 0 ? "l" : "r"}`,
    );
    rigidPart(
      head,
      placed(new SphereGeometry(0.01, 10, 8), {
        position: [side * 0.125, 0.213, 0.427],
      }),
      highlight,
      `face.highlight-${side < 0 ? "l" : "r"}`,
    );
    rigidPart(
      head,
      capsuleBetween(
        [side * 0.205, 0.32, 0.344],
        [side * 0.07, 0.325, 0.365],
        0.018,
      ),
      brow,
      `face.brow-${side < 0 ? "l" : "r"}`,
    );
  }
  rigidPart(
    head,
    mergeGeometries(
      [-1, 1].map((side) =>
        placed(new SphereGeometry(0.04, 16, 10), {
          position: [side * 0.235, 0.09, 0.34],
          scale: [1.5, 0.55, 0.28],
        }),
      ),
      false,
    ),
    blush,
    "face.cheeks",
  );
  rigidPart(
    head,
    placed(new SphereGeometry(0.055, 18, 12), {
      position: [0, 0.12, 0.372],
      scale: [0.7, 0.92, 0.58],
    }),
    material("#925837", { roughness: 0.78 }),
    "face.nose",
    { skinTintable: true },
  );
  rigidPart(
    head,
    placed(new TorusGeometry(0.085, 0.012, 8, 28, Math.PI), {
      position: [0, 0.055, 0.365],
      rotation: [0, 0, Math.PI],
    }),
    mouth,
    "face.smile",
  );
}

function addFallbackFeet(rig, sockMaterial) {
  for (const side of [-1, 1]) {
    const socket = rig.bones[side < 0 ? "foot_l" : "foot_r"];
    rigidPart(
      socket,
      placed(roundedBox(0.29, 0.16, 0.46, 0.06), {
        position: [0, -0.06, 0.17],
      }),
      sockMaterial,
      `body.foot-${side < 0 ? "l" : "r"}`,
      {
        bodyRegion: side < 0 ? "lower_leg_foot_l" : "lower_leg_foot_r",
      },
    );
  }
}

function createHair(item) {
  const root = assetRoot(item);
  const attachment = socketAttachment("socket_head");
  const hair = material(item.art.color, { roughness: 0.86 });
  const accent = material(item.art.accent ?? item.art.color, {
    roughness: 0.9,
  });
  const geometries = [];

  if (item.art.style === "curl-cloud") {
    geometries.push(
      placed(new SphereGeometry(0.36, 24, 14, 0, Math.PI * 2, 0, 1.9), {
        position: [0, -0.03, -0.02],
        scale: [1.02, 0.58, 0.96],
      }),
    );
    for (let row = 0; row < 3; row += 1) {
      const count = 7 - row;
      for (let index = 0; index < count; index += 1) {
        const x = (index - (count - 1) / 2) * 0.105;
        const y = 0.02 + row * 0.095;
        const z = 0.03 - Math.abs(x) * 0.18 - row * 0.025;
        geometries.push(
          placed(new SphereGeometry(0.07, 12, 8), {
            position: [x, y, z],
            scale: [1, 0.88, 0.92],
          }),
        );
      }
    }
  } else if (item.art.style === "side-swoop") {
    geometries.push(
      placed(new SphereGeometry(0.38, 26, 14, 0, Math.PI * 2, 0, 1.75), {
        position: [0, -0.04, -0.03],
        scale: [1.02, 0.55, 0.98],
      }),
    );
    for (let index = 0; index < 6; index += 1) {
      geometries.push(
        placed(new CapsuleGeometry(0.055, 0.22, 5, 10), {
          position: [-0.2 + index * 0.085, 0.11 - index * 0.007, 0.22],
          rotation: [0.22, 0.1, -1.05],
          scale: [1, 1 + index * 0.04, 0.72],
        }),
      );
    }
  } else if (item.art.style === "coil-puffs") {
    geometries.push(
      placed(new SphereGeometry(0.34, 22, 12, 0, Math.PI * 2, 0, 1.7), {
        position: [0, -0.06, -0.04],
        scale: [1, 0.48, 0.95],
      }),
    );
    for (const side of [-1, 1]) {
      for (let index = 0; index < 8; index += 1) {
        const angle = (index / 8) * Math.PI * 2;
        geometries.push(
          placed(new TorusGeometry(0.075, 0.03, 7, 14), {
            position: [
              side * (0.31 + Math.cos(angle) * 0.08),
              0.12 + Math.sin(angle) * 0.08,
              -0.02,
            ],
            rotation: [0, side * 0.25, angle],
          }),
        );
      }
    }
  } else if (item.art.style === "wave-crop") {
    geometries.push(
      placed(new SphereGeometry(0.37, 26, 14, 0, Math.PI * 2, 0, 1.72), {
        position: [0, -0.055, -0.02],
        scale: [1, 0.46, 0.96],
      }),
    );
    for (let index = 0; index < 7; index += 1) {
      geometries.push(
        placed(new TorusGeometry(0.075, 0.018, 6, 18, Math.PI * 1.5), {
          position: [-0.23 + index * 0.075, 0.065, 0.265],
          rotation: [0.2, 0, index % 2 ? 0.2 : -0.2],
          scale: [0.9, 0.55, 0.55],
        }),
      );
    }
  } else if (item.art.style === "braided-crown") {
    geometries.push(
      placed(new SphereGeometry(0.36, 24, 14, 0, Math.PI * 2, 0, 1.76), {
        position: [0, -0.05, -0.02],
        scale: [1, 0.52, 0.96],
      }),
    );
    for (let index = 0; index < 14; index += 1) {
      const angle = (index / 14) * Math.PI * 2;
      geometries.push(
        placed(new SphereGeometry(0.075, 12, 8), {
          position: [Math.cos(angle) * 0.31, 0.06, Math.sin(angle) * 0.29],
          scale: [1, 0.78, 0.82],
        }),
      );
    }
  } else {
    throw new Error(`Unknown hair style ${item.art.style}`);
  }

  const hairMesh = rigidPart(
    attachment,
    mergeGeometries(geometries, false),
    hair,
    `${item.id}.hair`,
  );
  hairMesh.castShadow = false;
  if (item.art.style === "coil-puffs") {
    rigidPart(
      attachment,
      placed(new TorusGeometry(0.055, 0.018, 7, 16), {
        position: [-0.31, 0.12, -0.02],
        rotation: [Math.PI / 2, 0, 0],
      }),
      accent,
      `${item.id}.band-l`,
    );
    rigidPart(
      attachment,
      placed(new TorusGeometry(0.055, 0.018, 7, 16), {
        position: [0.31, 0.12, -0.02],
        rotation: [Math.PI / 2, 0, 0],
      }),
      accent,
      `${item.id}.band-r`,
    );
  }
  root.add(attachment);
  return { scene: root };
}

function createTop(item) {
  const root = assetRoot(item);
  const rig = createCanonicalRig(root, { sockets: false });
  const main = material(NEUTRAL, { roughness: 0.9 });
  const accent = material(item.art.accent ?? LIME, { roughness: 0.86 });
  const dark = material(INK, { roughness: 0.88 });
  const longSleeves = ["training-layer", "goalkeeper", "warmup"].includes(
    item.art.style,
  );

  const torso = addSkinnedPart(root, rig, {
    name: `${item.id}.torso`,
    geometry: placed(
      roundedBox(
        item.art.style === "street-tee" ? 0.86 : 0.82,
        item.art.style === "warmup" ? 0.98 : 0.94,
        0.44,
        0.1,
      ),
      { position: [0, 2.13, 0] },
    ),
    material: main,
    boneName: "spine_02",
    userData: { tintable: true, garmentPart: "torso" },
  });
  torso.renderOrder = 1;

  for (const side of [-1, 1]) {
    const suffix = side < 0 ? "l" : "r";
    addSkinnedPart(root, rig, {
      name: `${item.id}.sleeve-${suffix}`,
      geometry: capsuleBetween(
        [side * 0.39, 2.5, 0],
        [side * 0.82, 2.4, 0],
        item.art.style === "goalkeeper" ? 0.17 : 0.15,
      ),
      material: main,
      boneName: `upper_arm_${suffix}`,
      userData: { tintable: true, garmentPart: "upper-sleeve" },
    });
    if (longSleeves) {
      addSkinnedPart(root, rig, {
        name: `${item.id}.lower-sleeve-${suffix}`,
        geometry: capsuleBetween(
          [side * 0.78, 2.41, 0],
          [side * 1.24, 2.31, 0],
          item.art.style === "goalkeeper" ? 0.14 : 0.125,
        ),
        material: item.art.style === "training-layer" ? material(WHITE) : main,
        boneName: `lower_arm_${suffix}`,
        userData: {
          tintable: item.art.style !== "training-layer",
          garmentPart: "lower-sleeve",
        },
      });
    }
  }

  if (item.art.style === "striker-jersey") {
    addChestPanels(root, rig, accent, "raglan");
  } else if (item.art.style === "training-layer") {
    addChestPanels(root, rig, dark, "side");
    addHem(root, rig, accent);
  } else if (item.art.style === "street-tee") {
    addChestPanels(root, rig, accent, "chest");
  } else if (item.art.style === "goalkeeper") {
    addChestPanels(root, rig, accent, "keeper");
    for (const side of [-1, 1]) {
      addSkinnedPart(root, rig, {
        name: `${item.id}.elbow-pad-${side < 0 ? "l" : "r"}`,
        geometry: placed(roundedBox(0.16, 0.2, 0.12, 0.04), {
          position: [side * 0.91, 2.42, -0.01],
          rotation: [0, 0, side * -0.22],
        }),
        material: dark,
        boneName: side < 0 ? "lower_arm_l" : "lower_arm_r",
        userData: { garmentPart: "elbow-pad" },
      });
    }
  } else if (item.art.style === "warmup") {
    addChestPanels(root, rig, accent, "shoulder");
    addSkinnedPart(root, rig, {
      name: `${item.id}.zipper`,
      geometry: placed(new BoxGeometry(0.018, 0.7, 0.018), {
        position: [0, 2.17, 0.235],
      }),
      material: dark,
      boneName: "spine_02",
      userData: { garmentPart: "zipper" },
    });
  }
  addCollar(root, rig, item, accent);
  addChestBadge(root, rig, accent, dark, item.id);
  return { scene: root };
}

function addChestPanels(root, rig, accent, type) {
  const panels = [];
  if (type === "raglan" || type === "shoulder") {
    panels.push(
      { x: -0.29, y: 2.47, width: 0.25, height: 0.08, rotation: -0.18 },
      { x: 0.29, y: 2.47, width: 0.25, height: 0.08, rotation: 0.18 },
    );
  } else if (type === "side") {
    panels.push(
      { x: -0.355, y: 2.15, width: 0.08, height: 0.68 },
      { x: 0.355, y: 2.15, width: 0.08, height: 0.68 },
    );
  } else if (type === "keeper") {
    panels.push({ x: 0, y: 2.27, width: 0.62, height: 0.22 });
  } else {
    panels.push({ x: 0, y: 2.21, width: 0.48, height: 0.28 });
  }
  for (const [index, panel] of panels.entries()) {
    addSkinnedPart(root, rig, {
      name: `garment.panel-${index}`,
      geometry: placed(roundedBox(panel.width, panel.height, 0.025, 0.015), {
        position: [panel.x, panel.y, 0.236],
        rotation: [0, 0, panel.rotation ?? 0],
      }),
      material: accent,
      boneName: "spine_02",
      userData: { garmentPart: "panel" },
    });
  }
}

function addChestBadge(root, rig, accent, dark, itemId) {
  addSkinnedPart(root, rig, {
    name: `${itemId}.crest`,
    geometry: placed(new CircleGeometry(0.078, 24), {
      position: [-0.18, 2.24, 0.243],
    }),
    material: accent,
    boneName: "spine_02",
    userData: { garmentPart: "crest" },
  });
  const mark = mergeGeometries(
    [
      placed(new BoxGeometry(0.075, 0.012, 0.008), {
        position: [-0.18, 2.272, 0.249],
      }),
      placed(new BoxGeometry(0.075, 0.012, 0.008), {
        position: [-0.18, 2.208, 0.249],
      }),
      placed(new BoxGeometry(0.012, 0.082, 0.008), {
        position: [-0.18, 2.24, 0.249],
        rotation: [0, 0, -0.72],
      }),
    ],
    false,
  );
  addSkinnedPart(root, rig, {
    name: `${itemId}.crest-mark`,
    geometry: mark,
    material: dark,
    boneName: "spine_02",
    userData: { garmentPart: "crest-mark" },
  });
}

function addHem(root, rig, accent) {
  addSkinnedPart(root, rig, {
    name: "garment.hem",
    geometry: placed(roundedBox(0.8, 0.07, 0.455, 0.025), {
      position: [0, 1.74, 0],
    }),
    material: accent,
    boneName: "spine_01",
    userData: { garmentPart: "hem" },
  });
}

function addCollar(root, rig, item, accent) {
  addSkinnedPart(root, rig, {
    name: `${item.id}.collar`,
    geometry: placed(new TorusGeometry(0.13, 0.025, 7, 24), {
      position: [0, 2.57, 0.15],
      rotation: [Math.PI / 2, 0, 0],
      scale: [1, 0.72, 1],
    }),
    material: accent,
    boneName: "chest",
    userData: { garmentPart: "collar" },
  });
}

function createBottom(item) {
  const root = assetRoot(item);
  const rig = createCanonicalRig(root, { sockets: false });
  const main = material(NEUTRAL, { roughness: 0.9 });
  const accent = material(item.art.accent ?? LIME, { roughness: 0.86 });
  const long = ["tapered-joggers", "keeper-pants"].includes(item.art.style);

  addSkinnedPart(root, rig, {
    name: `${item.id}.waist`,
    geometry: placed(roundedBox(0.62, 0.28, 0.42, 0.08), {
      position: [0, 1.58, 0],
    }),
    material: main,
    boneName: "hips",
    userData: { tintable: true, garmentPart: "waist" },
  });
  for (const side of [-1, 1]) {
    const suffix = side < 0 ? "l" : "r";
    addSkinnedPart(root, rig, {
      name: `${item.id}.upper-${suffix}`,
      geometry: placed(
        roundedBox(
          item.art.style === "match-shorts" ? 0.32 : 0.29,
          long ? 0.6 : item.art.style === "training-shorts" ? 0.46 : 0.52,
          0.36,
          0.07,
        ),
        { position: [side * 0.18, long ? 1.22 : 1.3, 0] },
      ),
      material: main,
      boneName: `upper_leg_${suffix}`,
      userData: { tintable: true, garmentPart: "upper-leg" },
    });
    if (long) {
      addSkinnedPart(root, rig, {
        name: `${item.id}.lower-${suffix}`,
        geometry: capsuleBetween(
          [side * 0.21, 0.94, 0],
          [side * 0.21, 0.43, 0.03],
          item.art.style === "keeper-pants" ? 0.15 : 0.135,
        ),
        material: main,
        boneName: `lower_leg_${suffix}`,
        userData: { tintable: true, garmentPart: "lower-leg" },
      });
    }
    if (["match-shorts", "keeper-pants"].includes(item.art.style)) {
      addSkinnedPart(root, rig, {
        name: `${item.id}.trim-${suffix}`,
        geometry: placed(new BoxGeometry(0.035, long ? 0.74 : 0.36, 0.025), {
          position: [side * 0.335, long ? 0.91 : 1.3, 0.19],
        }),
        material: accent,
        boneName: long ? `lower_leg_${suffix}` : `upper_leg_${suffix}`,
        userData: { garmentPart: "trim" },
      });
    }
  }
  return { scene: root };
}

function createFeet(item) {
  const root = assetRoot(item);
  const main = material(NEUTRAL, { roughness: 0.72 });
  const sole = material(INK, { roughness: 0.78 });
  const accent = material(item.art.accent ?? LIME, { roughness: 0.74 });
  for (const side of [-1, 1]) {
    const suffix = side < 0 ? "l" : "r";
    const attachment = socketAttachment(`socket_foot_${suffix}`);
    const highTop = item.art.style === "high-top";
    const cleat = item.art.style === "velocity-cleats";
    rigidPart(
      attachment,
      placed(roundedBox(0.32, highTop ? 0.27 : 0.19, 0.52, 0.07), {
        position: [0, highTop ? 0 : -0.06, 0.18],
      }),
      main,
      `${item.id}.upper-${suffix}`,
      { tintable: true },
    );
    rigidPart(
      attachment,
      placed(roundedBox(0.335, 0.065, 0.55, 0.025), {
        position: [0, -0.16, 0.19],
      }),
      sole,
      `${item.id}.sole-${suffix}`,
    );
    rigidPart(
      attachment,
      placed(new BoxGeometry(0.18, 0.025, 0.025), {
        position: [0, -0.01, 0.35],
        rotation: [0, 0, 0.12],
      }),
      accent,
      `${item.id}.lace-1-${suffix}`,
    );
    rigidPart(
      attachment,
      placed(new BoxGeometry(0.18, 0.025, 0.025), {
        position: [0, 0.035, 0.31],
        rotation: [0, 0, -0.12],
      }),
      accent,
      `${item.id}.lace-2-${suffix}`,
    );
    if (cleat) {
      const studs = [];
      for (const x of [-0.1, 0.1]) {
        for (const z of [0.05, 0.22, 0.38]) {
          studs.push(
            placed(new CylinderGeometry(0.025, 0.035, 0.06, 8), {
              position: [x, -0.21, z],
            }),
          );
        }
      }
      rigidPart(
        attachment,
        mergeGeometries(studs, false),
        accent,
        `${item.id}.studs-${suffix}`,
      );
    }
    root.add(attachment);
  }
  return { scene: root };
}

function createHeadwear(item) {
  const root = assetRoot(item);
  const attachment = socketAttachment("socket_head");
  const main = material(NEUTRAL, { roughness: 0.86 });
  const accent = material(item.art.accent ?? LIME, { roughness: 0.84 });
  if (item.art.style === "cap") {
    rigidPart(
      attachment,
      placed(new SphereGeometry(0.4, 28, 16, 0, Math.PI * 2, 0, 1.65), {
        position: [0, -0.05, -0.02],
        scale: [1.03, 0.72, 1],
      }),
      main,
      `${item.id}.crown`,
      { tintable: true },
    );
    rigidPart(
      attachment,
      placed(roundedBox(0.42, 0.055, 0.25, 0.025), {
        position: [0, -0.03, 0.35],
        rotation: [-0.12, 0, 0],
      }),
      main,
      `${item.id}.brim`,
      { tintable: true },
    );
    rigidPart(
      attachment,
      placed(new SphereGeometry(0.035, 12, 8), {
        position: [0, 0.27, -0.02],
      }),
      accent,
      `${item.id}.button`,
    );
  } else if (item.art.style === "beanie") {
    rigidPart(
      attachment,
      placed(new SphereGeometry(0.405, 28, 16, 0, Math.PI * 2, 0, 1.72), {
        position: [0, -0.055, -0.02],
        scale: [1.02, 0.78, 1],
      }),
      main,
      `${item.id}.body`,
      { tintable: true },
    );
    rigidPart(
      attachment,
      placed(new TorusGeometry(0.36, 0.045, 8, 30), {
        position: [0, -0.09, -0.02],
        rotation: [Math.PI / 2, 0, 0],
      }),
      accent,
      `${item.id}.cuff`,
    );
    rigidPart(
      attachment,
      placed(new SphereGeometry(0.09, 16, 10), {
        position: [0, 0.28, -0.02],
      }),
      accent,
      `${item.id}.pom`,
    );
  } else if (item.art.style === "sweatband") {
    rigidPart(
      attachment,
      placed(new TorusGeometry(0.365, 0.042, 8, 32), {
        position: [0, -0.08, 0.02],
        rotation: [Math.PI / 2, 0, 0],
        scale: [1, 1, 0.78],
      }),
      main,
      `${item.id}.band`,
      { tintable: true },
    );
  } else {
    throw new Error(`Unknown headwear style ${item.art.style}`);
  }
  root.add(attachment);
  return { scene: root };
}

function createEyewear(item) {
  const root = assetRoot(item);
  const attachment = socketAttachment("socket_face");
  const frame = material(item.art.color ?? INK, {
    metalness: 0.08,
    roughness: 0.45,
  });
  if (item.art.style === "sport-frames") {
    for (const side of [-1, 1]) {
      rigidPart(
        attachment,
        placed(new TorusGeometry(0.095, 0.014, 7, 24), {
          position: [side * 0.135, 0.08, 0.015],
          scale: [1.05, 0.86, 1],
        }),
        frame,
        `${item.id}.lens-${side < 0 ? "l" : "r"}`,
      );
    }
    rigidPart(
      attachment,
      placed(new CapsuleGeometry(0.012, 0.055, 4, 8), {
        position: [0, 0.08, 0.015],
        rotation: [0, 0, Math.PI / 2],
      }),
      frame,
      `${item.id}.bridge`,
    );
  } else if (item.art.style === "sun-shield") {
    rigidPart(
      attachment,
      placed(roundedBox(0.34, 0.14, 0.025, 0.045), {
        position: [0, 0.08, 0.02],
      }),
      material("#5c8fc5", {
        metalness: 0.18,
        opacity: 0.72,
        roughness: 0.24,
        transparent: true,
      }),
      `${item.id}.shield`,
    );
    rigidPart(
      attachment,
      placed(roundedBox(0.37, 0.025, 0.035, 0.01), {
        position: [0, 0.155, 0.005],
      }),
      frame,
      `${item.id}.frame`,
    );
  } else {
    throw new Error(`Unknown eyewear style ${item.art.style}`);
  }
  root.add(attachment);
  return { scene: root };
}

function createBack(item) {
  const root = assetRoot(item);
  const attachment = socketAttachment("socket_back");
  const main = material(NEUTRAL, { roughness: 0.88 });
  const accent = material(item.art.accent ?? LIME, { roughness: 0.84 });
  if (item.art.style === "training-pack") {
    rigidPart(
      attachment,
      placed(roundedBox(0.5, 0.62, 0.22, 0.09), {
        position: [0, -0.02, -0.12],
      }),
      main,
      `${item.id}.body`,
      { tintable: true },
    );
    rigidPart(
      attachment,
      placed(roundedBox(0.38, 0.19, 0.08, 0.035), {
        position: [0, -0.14, -0.255],
      }),
      accent,
      `${item.id}.pocket`,
    );
    rigidPart(
      attachment,
      placed(new TorusGeometry(0.12, 0.025, 7, 22, Math.PI), {
        position: [0, 0.35, -0.1],
        rotation: [0, 0, 0],
      }),
      accent,
      `${item.id}.handle`,
    );
  } else if (item.art.style === "ball-net") {
    rigidPart(
      attachment,
      placed(new SphereGeometry(0.27, 20, 14), {
        position: [0, -0.08, -0.22],
      }),
      material(WHITE, { roughness: 0.6 }),
      `${item.id}.ball`,
    );
    rigidPart(
      attachment,
      placed(new SphereGeometry(0.285, 12, 8), {
        position: [0, -0.08, -0.22],
      }),
      material(INK, { roughness: 0.72, wireframe: true }),
      `${item.id}.net`,
    );
    rigidPart(
      attachment,
      placed(new TorusGeometry(0.18, 0.025, 7, 24, Math.PI), {
        position: [0, 0.25, -0.11],
      }),
      accent,
      `${item.id}.strap`,
    );
  } else {
    throw new Error(`Unknown back style ${item.art.style}`);
  }
  root.add(attachment);
  return { scene: root };
}

function bodyCapsule(
  root,
  rig,
  name,
  boneName,
  region,
  start,
  end,
  radius,
  partMaterial,
  skinTintable = true,
) {
  return addSkinnedPart(root, rig, {
    name,
    geometry: capsuleBetween(start, end, radius),
    material: partMaterial,
    boneName,
    userData: { bodyRegion: region, skinTintable },
  });
}

function assetRoot(item, name = "AvatarCosmetic") {
  const root = new Group();
  root.name = name;
  root.userData = {
    itemId: item.id,
    rigVersion: RIG_VERSION,
    artStatus: "review-quality",
    sourceType: "zoomigo-engineering-art",
  };
  return root;
}

function socketAttachment(socketName) {
  const group = new Group();
  group.name = `${socketName}.attachment`;
  group.userData.socket = socketName;
  return group;
}

function rigidPart(parent, geometry, partMaterial, name, userData = {}) {
  const mesh = new Mesh(geometry, partMaterial);
  mesh.name = name;
  mesh.userData = userData;
  parent.add(mesh);
  return mesh;
}

function roundedBox(width, height, depth, radius) {
  return new RoundedBoxGeometry(width, height, depth, 4, radius);
}

function capsuleBetween(startArray, endArray, radius) {
  const start = new Vector3().fromArray(startArray);
  const end = new Vector3().fromArray(endArray);
  const direction = end.clone().sub(start);
  const distance = direction.length();
  const geometry = new CapsuleGeometry(
    radius,
    Math.max(0.01, distance - radius * 2),
    6,
    12,
  );
  geometry.applyQuaternion(
    new Quaternion().setFromUnitVectors(
      new Vector3(0, 1, 0),
      direction.normalize(),
    ),
  );
  geometry.translate(
    (start.x + end.x) / 2,
    (start.y + end.y) / 2,
    (start.z + end.z) / 2,
  );
  return geometry;
}

function placed(
  geometry,
  { position = [0, 0, 0], rotation = [0, 0, 0], scale = [1, 1, 1] } = {},
) {
  geometry.rotateX(rotation[0]);
  geometry.rotateY(rotation[1]);
  geometry.rotateZ(rotation[2]);
  geometry.scale(scale[0], scale[1], scale[2]);
  geometry.translate(position[0], position[1], position[2]);
  return geometry;
}

function material(
  color,
  {
    metalness = 0.02,
    opacity = 1,
    roughness = 0.8,
    transparent = false,
    wireframe = false,
  } = {},
) {
  return new MeshStandardMaterial({
    color: new Color(color),
    metalness,
    opacity,
    roughness,
    transparent,
    wireframe,
  });
}

function createAnimations() {
  return [
    new AnimationClip("idle_default", 2.4, [
      quaternionTrack("chest", [0, 1.2, 2.4], [0, 0.035, 0]),
      quaternionTrack("head", [0, 1.2, 2.4], [-0.025, 0.025, -0.025]),
      positionTrack(
        "hips",
        [0, 1.2, 2.4],
        [
          [0, 1.56, 0],
          [0, 1.585, 0],
          [0, 1.56, 0],
        ],
      ),
    ]),
    new AnimationClip("idle_focus", 3, [
      quaternionTrack("head", [0, 1.5, 3], [0.05, -0.08, 0.05]),
      quaternionTrack("chest", [0, 1.5, 3], [-0.03, 0.03, -0.03]),
    ]),
    locomotionClip("walk", 0.82, 0.52),
    locomotionClip("run", 0.54, 0.9),
    new AnimationClip("celebration_jump", 1.25, [
      positionTrack(
        "hips",
        [0, 0.35, 0.75, 1.25],
        [
          [0, 1.56, 0],
          [0, 1.88, 0],
          [0, 1.88, 0],
          [0, 1.56, 0],
        ],
      ),
      quaternionTrack(
        "upper_arm_l",
        [0, 0.25, 0.95, 1.25],
        [0, -2.15, -2.15, 0],
      ),
      quaternionTrack("upper_arm_r", [0, 0.25, 0.95, 1.25], [0, 2.15, 2.15, 0]),
    ]),
    new AnimationClip("celebration_fistpump", 1.4, [
      quaternionTrack(
        "upper_arm_r",
        [0, 0.25, 0.55, 0.85, 1.4],
        [0, 1.7, 1.25, 1.7, 0],
      ),
      quaternionTrack(
        "lower_arm_r",
        [0, 0.25, 0.55, 0.85, 1.4],
        [0, -1.25, -1.5, -1.25, 0],
      ),
    ]),
  ];
}

function locomotionClip(name, duration, swing) {
  const times = [0, duration / 4, duration / 2, (duration * 3) / 4, duration];
  const forward = [0, swing, 0, -swing, 0];
  const backward = forward.map((value) => -value);
  return new AnimationClip(name, duration, [
    quaternionTrack("upper_leg_l", times, forward),
    quaternionTrack("upper_leg_r", times, backward),
    quaternionTrack(
      "lower_leg_l",
      times,
      backward.map((value) => value * 0.5),
    ),
    quaternionTrack(
      "lower_leg_r",
      times,
      forward.map((value) => value * 0.5),
    ),
    quaternionTrack(
      "upper_arm_l",
      times,
      backward.map((value) => value * 0.7),
    ),
    quaternionTrack(
      "upper_arm_r",
      times,
      forward.map((value) => value * 0.7),
    ),
  ]);
}

function quaternionTrack(nodeName, times, xRotations) {
  const axis = new Vector3(1, 0, 0);
  const values = xRotations.flatMap((angle) =>
    new Quaternion().setFromAxisAngle(axis, angle).toArray(),
  );
  return new QuaternionKeyframeTrack(`${nodeName}.quaternion`, times, values);
}

function positionTrack(nodeName, times, positions) {
  return new VectorKeyframeTrack(
    `${nodeName}.position`,
    times,
    positions.flat(),
  );
}
