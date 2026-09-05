import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

const root = process.cwd();
const specRoot = resolve(root, "content/avatar/spec");
const plan = await readJson(resolve(specRoot, "production-assets.json"));
const schema = await readJson(resolve(specRoot, "avatar-asset.schema.json"));
const productionBrief = await readFile(
  resolve(root, "content/avatar/ASSET_PRODUCTION_LIST.md"),
  "utf8",
);

validatePlan(plan, productionBrief);

const submissionPaths =
  process.argv.length > 2
    ? process.argv.slice(2).map((path) => resolve(root, path))
    : [
        resolve(specRoot, "examples/humanoid-wearable.example.json"),
        resolve(specRoot, "examples/non-humanoid-base.example.json"),
        resolve(specRoot, "examples/cross-family-headwear.example.json"),
      ];

for (const path of submissionPaths) {
  validateSubmission(await readJson(path), schema, path);
}

console.log(
  `Validated ${plan.assets.length} production briefs and ${submissionPaths.length} artist submission manifests`,
);

function validatePlan(value, brief) {
  assert(value.schemaVersion === 1, "production spec schemaVersion must be 1");
  assert(value.status === "artist-brief", "production spec status drift");
  assert(value.units === "meters", "production units must be meters");
  assert(
    value.exportAxes?.up === "+Y" && value.exportAxes?.forward === "+Z",
    "production export axes must be +Y up and +Z forward",
  );

  const visualDirection = record(value.visualDirection, "visualDirection");
  assert(
    visualDirection.id === "zoomigo-graphic-toon-v1",
    "production visual direction ID drift",
  );
  assert(
    visualDirection.realismScale === 4,
    "production realism target must be 4/10",
  );
  assert(
    sameStrings(visualDirection.presentation, [
      "toon_shaded_3d",
      "cel_shaded_3d",
      "illustrated_3d",
    ]),
    "production presentation modes drift",
  );
  assert(
    visualDirection.contourTreatment === "selective_accents",
    "production contours must use selective accents",
  );
  assert(
    sameStrings(visualDirection.reviewSizes, [
      "hero",
      "customizer",
      "lounge_near",
      "lounge_far",
    ]),
    "visual direction must cover every runtime review size",
  );

  const expressionContract = record(
    value.expressionContract,
    "expressionContract",
  );
  assert(
    sameStrings(expressionContract.semantics, [
      "blink_l",
      "blink_r",
      "smile",
      "mouth_open",
      "surprised",
    ]),
    "semantic expression contract drift",
  );
  assert(
    expressionContract.implementationStatus === "foundation-gate-decision",
    "face implementation must be decided at the foundation gate",
  );
  assert(
    sameStrings(expressionContract.compatibleImplementations, [
      "minimal_mesh_morphs",
      "graphic_feature_states",
      "hybrid",
    ]),
    "face implementation candidates drift",
  );
  assert(
    expressionContract.legacyMorphCompatibility === true,
    "existing morph compatibility must remain explicit",
  );

  const families = array(value.families, "families");
  const familyIds = uniqueIds(families, "family");
  assert(families.length >= 2, "at least two avatar families are required");
  assert(
    families.some(({ archetype }) => archetype === "non_humanoid"),
    "a non-humanoid family proof is required",
  );
  for (const family of families) {
    strings(family.capabilities, `${family.id} capabilities`);
    strings(family.requiredAnchors, `${family.id} anchors`);
    strings(family.bodyRegions, `${family.id} body regions`);
    assert(
      typeof family.referenceHeightMeters === "number" &&
        family.referenceHeightMeters > 0,
      `${family.id} needs a positive reference height`,
    );
    assert(
      !Object.hasOwn(family, "humanOnly"),
      `${family.id} must use capabilities, not a humanOnly flag`,
    );
  }

  const deliveryProfiles = record(value.deliveryProfiles, "deliveryProfiles");
  const budgetProfiles = record(value.budgetProfiles, "budgetProfiles");
  const slotCapabilities = record(value.slotCapabilities, "slotCapabilities");
  const assets = array(value.assets, "assets");
  uniqueIds(assets, "asset");
  assert(assets.length >= 50, "the production list needs at least 50 assets");

  const phases = new Set([
    "foundation",
    "launch",
    "expansion",
    "platform-proof",
  ]);
  const assetTypes = new Set([
    "base_character",
    "face_preset",
    "skinned_wearable",
    "socket_cosmetic",
    "animation_clip",
    "effect_recipe",
  ]);
  const materialModes = new Set(["fixed", "tint1", "palette3", "skin"]);

  for (const asset of assets) {
    assert(phases.has(asset.phase), `${asset.id} has an invalid phase`);
    assert(assetTypes.has(asset.assetType), `${asset.id} has an invalid type`);
    assert(
      materialModes.has(asset.materialMode),
      `${asset.id} has an invalid material mode`,
    );
    assert(
      Object.hasOwn(deliveryProfiles, asset.deliveryProfile),
      `${asset.id} references an unknown delivery profile`,
    );
    assert(
      Object.hasOwn(budgetProfiles, asset.budgetProfile),
      `${asset.id} references an unknown budget profile`,
    );
    assert(
      typeof asset.designBrief === "string" && asset.designBrief.length >= 24,
      `${asset.id} needs a useful design brief`,
    );
    assert(
      !/toy-like|bubbly|chibi|photoreal/i.test(asset.designBrief),
      `${asset.id} uses rejected visual-direction language`,
    );
    strings(asset.acceptanceChecks, `${asset.id} acceptance checks`);
    assert(
      asset.acceptanceChecks.length >= 3,
      `${asset.id} needs at least three acceptance checks`,
    );
    for (const familyId of strings(
      asset.familyTargets,
      `${asset.id} family targets`,
    )) {
      assert(familyIds.has(familyId), `${asset.id} targets ${familyId}`);
      if (asset.slot) {
        const capability = slotCapabilities[asset.slot];
        assert(capability, `${asset.id} uses unknown slot ${asset.slot}`);
        const family = families.find(({ id }) => id === familyId);
        assert(
          family.capabilities.includes(capability),
          `${asset.id} requires ${capability}, which ${familyId} does not provide`,
        );
      }
    }
    assert(
      brief.includes(`\`${asset.id}\``),
      `${asset.id} is missing from the readable production list`,
    );
    if (asset.familyTargets.length > 1) {
      assert(
        ["socket_cosmetic", "animation_clip"].includes(asset.assetType),
        `${asset.id} cannot share skinned geometry across families`,
      );
    }
  }

  for (const [name, budget] of Object.entries(budgetProfiles)) {
    for (const field of [
      "lod0Triangles",
      "lod1Triangles",
      "materials",
      "textureMax",
      "deformBones",
      "influences",
    ]) {
      assert(
        Number.isInteger(budget[field]) && budget[field] >= 0,
        `${name}.${field} must be a non-negative integer`,
      );
    }
    assert(
      budget.lod1Triangles <= budget.lod0Triangles,
      `${name} LOD1 exceeds LOD0`,
    );
    assert(budget.influences <= 4, `${name} exceeds four bone influences`);
    assert(budget.deformBones <= 60, `${name} exceeds 60 deform bones`);
  }

  const expectedProof = [
    "base.mascot-scout-v1",
    "mascot.head.antenna-band",
    "mascot.back.energy-pack",
  ];
  for (const id of expectedProof) {
    assert(
      assets.some((asset) => asset.id === id),
      `non-human proof asset ${id} is missing`,
    );
  }

  const humanFamily = families.find(
    ({ id }) => id === "family.zoomigo-humanoid-v1",
  );
  assert(
    humanFamily?.designScope === "initial_youth_player_family" &&
      humanFamily?.bodyVariationPolicy === "locked_family_proportions",
    "the first humanoid family needs an explicit scoped body contract",
  );

  const humanBase = assets.find(({ id }) => id === "base.player-biped-v2");
  assert(
    humanBase &&
      humanBase.acceptanceChecks.includes("face_system_decision") &&
      humanBase.acceptanceChecks.includes("semantic_expressions") &&
      !humanBase.acceptanceChecks.includes("face_morphs"),
    "the humanoid base must select a face system without preselecting morphs",
  );
}

function validateSubmission(value, contract, path) {
  const label = value.assetId ?? path;
  required(value, contract.required, label);
  assert(value.schemaVersion === 1, `${label} schemaVersion must be 1`);
  assert(
    new RegExp(contract.properties.assetId.pattern).test(value.assetId),
    `${label} has an invalid assetId`,
  );
  assert(
    contract.properties.assetType.enum.includes(value.assetType),
    `${label} has an invalid assetType`,
  );
  strings(value.familyTargets, `${label} familyTargets`);
  assert(value.familyTargets.length > 0, `${label} needs a family target`);

  const deliverySchema = contract.properties.delivery;
  required(value.delivery, deliverySchema.required, `${label}.delivery`);
  assert(
    /\.blend$/.test(value.delivery.sourceBlend),
    `${label} needs a .blend`,
  );
  assert(/\.glb$/.test(value.delivery.reviewGlb), `${label} needs a .glb`);
  assert(/\.json$/.test(value.delivery.manifest), `${label} needs a manifest`);
  assert(
    /\.(png|webp)$/.test(value.delivery.contactSheet),
    `${label} needs a contact sheet`,
  );

  const geometrySchema = contract.properties.geometry;
  required(value.geometry, geometrySchema.required, `${label}.geometry`);
  for (const field of geometrySchema.required) {
    assert(
      Number.isInteger(value.geometry[field]) && value.geometry[field] >= 0,
      `${label}.geometry.${field} must be a non-negative integer`,
    );
  }
  assert(
    (value.geometry.boneInfluencesMax ?? 0) <= 4,
    `${label} exceeds four bone influences`,
  );

  const materialsSchema = contract.properties.materials;
  required(value.materials, materialsSchema.required, `${label}.materials`);
  assert(
    materialsSchema.properties.mode.enum.includes(value.materials.mode),
    `${label} has an invalid material mode`,
  );
  strings(value.materials.materialRoles, `${label} material roles`, true);

  const compatibilitySchema = contract.properties.compatibility;
  required(
    value.compatibility,
    compatibilitySchema.required,
    `${label}.compatibility`,
  );
  for (const field of compatibilitySchema.required.filter(
    (field) => field !== "slot",
  )) {
    strings(
      value.compatibility[field],
      `${label}.compatibility.${field}`,
      true,
    );
  }

  const qaSchema = contract.properties.qa;
  required(value.qa, qaSchema.required, `${label}.qa`);
  strings(value.qa.requiredPoses, `${label} required poses`);
  assert(
    qaSchema.properties.reviewStatus.enum.includes(value.qa.reviewStatus),
    `${label} has an invalid review status`,
  );

  if (["base_character", "skinned_wearable"].includes(value.assetType)) {
    assert(typeof value.rigVersion === "string", `${label} needs a rigVersion`);
  }
  if (value.assetType === "animation_clip") {
    assert(
      value.familyTargets.length === 1,
      `${label} animation submissions must target exactly one family`,
    );
  }
  if (value.assetType === "socket_cosmetic" && value.familyTargets.length > 1) {
    assert(
      isRecord(value.familyPlacements),
      `${label} needs familyPlacements for every target family`,
    );
    for (const familyId of value.familyTargets) {
      const placement = value.familyPlacements[familyId];
      assert(isRecord(placement), `${label} is missing ${familyId} placement`);
      vector(placement.translation, 3, `${label} ${familyId} translation`);
      vector(placement.rotation, 4, `${label} ${familyId} rotation`);
      vector(placement.scale, 3, `${label} ${familyId} scale`, true);
    }
  }
  if (value.assetType === "base_character") {
    strings(value.capabilitiesProvided, `${label} capabilities`);
    assert(isRecord(value.anchors), `${label} needs an anchor map`);
  }
}

async function readJson(path) {
  return JSON.parse(await readFile(path, "utf8"));
}

function required(value, fields, label) {
  assert(isRecord(value), `${label} must be an object`);
  for (const field of fields) {
    assert(Object.hasOwn(value, field), `${label} is missing ${field}`);
  }
}

function record(value, label) {
  assert(isRecord(value), `${label} must be an object`);
  return value;
}

function array(value, label) {
  assert(Array.isArray(value), `${label} must be an array`);
  return value;
}

function strings(value, label, allowEmpty = false) {
  const result = array(value, label);
  assert(
    allowEmpty || result.length > 0,
    `${label} must contain at least one value`,
  );
  assert(
    result.every((entry) => typeof entry === "string" && entry.length > 0),
    `${label} must contain strings`,
  );
  assert(
    new Set(result).size === result.length,
    `${label} contains duplicates`,
  );
  return result;
}

function uniqueIds(values, label) {
  const ids = values.map((value) => value.id);
  strings(ids, `${label} IDs`);
  return new Set(ids);
}

function sameStrings(value, expected) {
  return (
    Array.isArray(value) &&
    value.length === expected.length &&
    value.every((entry, index) => entry === expected[index])
  );
}

function vector(value, length, label, positive = false) {
  assert(
    Array.isArray(value) && value.length === length,
    `${label} is invalid`,
  );
  assert(
    value.every(
      (entry) =>
        typeof entry === "number" &&
        Number.isFinite(entry) &&
        (!positive || entry > 0),
    ),
    `${label} contains an invalid number`,
  );
}

function isRecord(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}
