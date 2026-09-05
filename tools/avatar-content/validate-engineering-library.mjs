import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { relative, resolve, sep } from "node:path";

import {
  CANONICAL_BONES,
  CANONICAL_SOCKETS,
  RIG_VERSION,
} from "./lib/avatar-rig.mjs";

const projectRoot = process.cwd();
const sourceRoot = resolve(projectRoot, "content/avatar/source");
const library = JSON.parse(
  await readFile(
    resolve(projectRoot, "content/avatar/engineering-library.json"),
    "utf8",
  ),
);
const catalog = JSON.parse(
  await readFile(
    resolve(
      projectRoot,
      "public/avatar/catalog/avatar-catalog.engineering.json",
    ),
    "utf8",
  ),
);
const requiredAnimations = [
  "idle_default",
  "idle_focus",
  "walk",
  "run",
  "celebration_jump",
  "celebration_fistpump",
];
const requiredSlotCounts = new Map([
  ["hair", 5],
  ["top", 5],
  ["bottom", 5],
  ["feet", 4],
  ["headwear", 3],
  ["eyewear", 2],
  ["back", 2],
]);

assert(library.rigVersion === RIG_VERSION, "authoring rig version drift");
assert(catalog.schemaVersion === library.schemaVersion, "schema version drift");
assert(
  catalog.catalogVersion === library.catalogVersion,
  "catalog version drift",
);
assert(catalog.rigVersion === library.rigVersion, "compiled rig version drift");
assert(
  catalog.items.length === library.items.length,
  "compiled catalog item count drift",
);
assert(library.items.length >= 27, "engineering catalog is not broad enough");
assertUnique(
  library.colors.map(({ id }) => id),
  "catalog color ID",
);
assert(
  library.colors.filter(({ id }) => id.startsWith("skin.")).length >= 6,
  "engineering catalog needs at least six curated skin tones",
);
assertUnique(
  library.items.map(({ id }) => id),
  "catalog item ID",
);
assertUnique(
  library.items.map(({ source }) => source),
  "source asset path",
);
for (const [slot, minimum] of requiredSlotCounts) {
  assert(
    library.items.filter((item) => item.slot === slot).length >= minimum,
    `${slot} needs at least ${minimum} review assets`,
  );
}

const concept = await readFile(
  resolve(
    projectRoot,
    "content/avatar/art-direction/zoomigo-player-turnaround-v1.png",
  ),
);
assert(
  concept.subarray(0, 8).equals(Buffer.from("89504e470d0a1a0a", "hex")),
  "art direction asset is not a PNG",
);
assert(
  concept.byteLength > 100_000,
  "art direction asset is unexpectedly small",
);

let sourceBytes = 0;
let optimizedBytes = 0;
for (const definition of library.items) {
  const item = catalog.items.find(({ id }) => id === definition.id);
  assert(item, `compiled item ${definition.id} is missing`);
  assert(item.kind === definition.kind, `${item.id} kind drift`);
  assert(item.slot === definition.slot, `${item.id} slot drift`);
  assert(!("source" in item), `${item.id} leaked its source path`);
  assert(!("art" in item), `${item.id} leaked its art recipe`);

  const sourcePath = resolve(projectRoot, definition.source);
  assertInsideSourceRoot(sourcePath);
  const authoredBytes = await readFile(sourcePath);
  const authored = parseGLB(authoredBytes);
  sourceBytes += authoredBytes.byteLength;
  validateMetadata(authored.json, item);
  validateGeometry(authored.json, item, false);
  validateAssetContract(authored, item);

  const asset = item.assets?.lod0;
  assert(asset, `${item.id} has no lod0 asset`);
  assert(
    asset.url === `/avatar/assets/${asset.sha256}.glb`,
    `${item.id} asset URL is not content addressed`,
  );
  const runtimeBytes = await readFile(
    resolve(projectRoot, "public", asset.url.slice(1)),
  );
  optimizedBytes += runtimeBytes.byteLength;
  assert(runtimeBytes.byteLength === asset.bytes, `${item.id} byte-size drift`);
  assert(
    createHash("sha256").update(runtimeBytes).digest("hex") === asset.sha256,
    `${item.id} content hash drift`,
  );
  const runtime = parseGLB(runtimeBytes);
  validateMetadata(runtime.json, item);
  validateGeometry(runtime.json, item, true);
  validateAssetContract(runtime, item, true);
}

assert(
  optimizedBytes < sourceBytes,
  "optimized avatar library must be smaller than its sources",
);
console.log(
  `Validated ${catalog.items.length} authored and Meshopt-compressed avatar assets`,
);

function validateMetadata(gltf, item) {
  const itemNode = (gltf.nodes ?? []).find(
    ({ extras }) => extras?.itemId === item.id,
  );
  assert(itemNode, `${item.id} metadata does not identify the item`);
  assert(
    itemNode.extras.rigVersion === RIG_VERSION,
    `${item.id} metadata has the wrong rig version`,
  );
  assert(
    itemNode.extras.artStatus === "review-quality",
    `${item.id} is not marked as review-quality artwork`,
  );
}

function validateGeometry(gltf, item, optimized) {
  const stats = geometryStats(gltf);
  const triangleBudget = item.kind === "base" ? 25_000 : 12_000;
  assert(stats.triangles > 100, `${item.id} has placeholder-level geometry`);
  assert(
    stats.triangles <= triangleBudget,
    `${item.id} exceeds its ${triangleBudget}-triangle budget`,
  );
  assert(
    stats.drawCalls <= 32,
    `${item.id} has ${stats.drawCalls} draw calls; budget is 32`,
  );
  for (const accessor of gltf.accessors ?? []) {
    for (const value of [...(accessor.min ?? []), ...(accessor.max ?? [])]) {
      assert(Number.isFinite(value), `${item.id} has non-finite bounds`);
    }
  }
  if (optimized) {
    assert(
      (gltf.extensionsUsed ?? []).includes("EXT_meshopt_compression"),
      `${item.id} is not Meshopt-compressed`,
    );
    const unsupported = (gltf.extensionsUsed ?? []).find(
      (name) =>
        !["EXT_meshopt_compression", "KHR_mesh_quantization"].includes(name),
    );
    assert(
      !unsupported,
      `${item.id} uses unsupported extension ${unsupported}`,
    );
  }
}

function validateAssetContract(gltf, item, optimized = false) {
  const nodes = gltf.json.nodes ?? [];
  if (item.kind === "base") {
    const nodeNames = new Set(nodes.map(({ name }) => name));
    for (const name of [...CANONICAL_BONES, ...CANONICAL_SOCKETS]) {
      assert(nodeNames.has(name), `${item.id} is missing ${name}`);
    }
    const animationNames = new Set(
      (gltf.json.animations ?? []).map(({ name }) => name),
    );
    for (const name of requiredAnimations) {
      assert(animationNames.has(name), `${item.id} is missing ${name}`);
    }
    for (const animation of gltf.json.animations ?? []) {
      if (!["walk", "run"].includes(animation.name)) continue;
      assert(
        animation.channels.every(({ target }) => target.path !== "translation"),
        `${item.id} ${animation.name} must remain in place`,
      );
    }
    assert(
      (gltf.json.skins ?? []).length > 0,
      `${item.id} has no canonical skin`,
    );
    validateSkinWeights(gltf, item, false, !optimized);
    return;
  }

  if (item.kind === "skinned") {
    assert((gltf.json.skins ?? []).length > 0, `${item.id} has no skin`);
    const jointNames = new Set(
      (gltf.json.skins?.[0]?.joints ?? []).map((index) => nodes[index]?.name),
    );
    for (const name of CANONICAL_BONES) {
      assert(jointNames.has(name), `${item.id} skin is missing ${name}`);
    }
    validateSkinWeights(gltf, item, true, !optimized);
  } else {
    const sockets = nodes
      .map(({ extras }) => extras?.socket)
      .filter((socket) => typeof socket === "string");
    assert(sockets.length > 0, `${item.id} has no socket attachment`);
    assert(
      sockets.every((socket) => CANONICAL_SOCKETS.includes(socket)),
      `${item.id} uses an unsupported socket`,
    );
  }

  if (item.materialMode === "tint1") {
    assert(
      nodes.some(({ extras }) => extras?.tintable === true),
      `${item.id} has no tintable mesh`,
    );
  }
}

function validateSkinWeights(gltf, item, requireEveryMesh, readValues = true) {
  let skinnedPrimitiveCount = 0;
  for (const node of gltf.json.nodes ?? []) {
    if (node.mesh === undefined) continue;
    const primitives = gltf.json.meshes?.[node.mesh]?.primitives ?? [];
    if (node.skin === undefined) {
      assert(
        !requireEveryMesh,
        `${item.id} contains an unskinned garment mesh`,
      );
      continue;
    }
    const jointCount = gltf.json.skins?.[node.skin]?.joints?.length ?? 0;
    for (const primitive of primitives) {
      const jointAccessor = primitive.attributes?.JOINTS_0;
      const weightAccessor = primitive.attributes?.WEIGHTS_0;
      assert(jointAccessor !== undefined, `${item.id} is missing JOINTS_0`);
      assert(weightAccessor !== undefined, `${item.id} is missing WEIGHTS_0`);
      if (!readValues) {
        const joints = gltf.json.accessors?.[jointAccessor];
        const weights = gltf.json.accessors?.[weightAccessor];
        assert(joints?.type === "VEC4", `${item.id} JOINTS_0 must be VEC4`);
        assert(weights?.type === "VEC4", `${item.id} WEIGHTS_0 must be VEC4`);
        assert(
          joints.count === weights.count,
          `${item.id} skin accessor drift`,
        );
        skinnedPrimitiveCount += 1;
        continue;
      }
      const joints = readAccessor(gltf, jointAccessor);
      const weights = readAccessor(gltf, weightAccessor);
      assert(joints.components === 4, `${item.id} JOINTS_0 must be VEC4`);
      assert(weights.components === 4, `${item.id} WEIGHTS_0 must be VEC4`);
      assert(joints.count === weights.count, `${item.id} skin accessor drift`);
      for (let vertex = 0; vertex < weights.count; vertex += 1) {
        const weightRow = weights.values.slice(vertex * 4, vertex * 4 + 4);
        const jointRow = joints.values.slice(vertex * 4, vertex * 4 + 4);
        const sum = weightRow.reduce((total, value) => total + value, 0);
        assert(
          Math.abs(sum - 1) < 0.001,
          `${item.id} has non-normalized skin weights`,
        );
        assert(
          weightRow.filter((value) => value > 0).length <= 4,
          `${item.id} exceeds four bone influences`,
        );
        assert(
          jointRow.every((value) => value < jointCount),
          `${item.id} has an out-of-range joint index`,
        );
      }
      skinnedPrimitiveCount += 1;
    }
  }
  assert(skinnedPrimitiveCount > 0, `${item.id} has no skinned primitives`);
}

function readAccessor(gltf, accessorIndex) {
  const accessor = gltf.json.accessors?.[accessorIndex];
  assert(accessor, `missing accessor ${accessorIndex}`);
  const view = gltf.json.bufferViews?.[accessor.bufferView];
  assert(view, `missing buffer view for accessor ${accessorIndex}`);
  const components = { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4 }[accessor.type];
  assert(components, `unsupported accessor type ${accessor.type}`);
  const readers = {
    5121: { bytes: 1, read: (data, offset) => data.getUint8(offset) },
    5123: {
      bytes: 2,
      read: (data, offset) => data.getUint16(offset, true),
    },
    5125: {
      bytes: 4,
      read: (data, offset) => data.getUint32(offset, true),
    },
    5126: {
      bytes: 4,
      read: (data, offset) => data.getFloat32(offset, true),
    },
  };
  const reader = readers[accessor.componentType];
  assert(reader, `unsupported component type ${accessor.componentType}`);
  const start = (view.byteOffset ?? 0) + (accessor.byteOffset ?? 0);
  const stride = view.byteStride ?? reader.bytes * components;
  const data = new DataView(
    gltf.bin.buffer,
    gltf.bin.byteOffset,
    gltf.bin.byteLength,
  );
  const values = [];
  for (let index = 0; index < accessor.count; index += 1) {
    for (let component = 0; component < components; component += 1) {
      values.push(
        reader.read(data, start + index * stride + component * reader.bytes),
      );
    }
  }
  return { components, count: accessor.count, values };
}

function parseGLB(bytes) {
  assert(bytes.readUInt32LE(0) === 0x46546c67, "asset is not a GLB");
  assert(bytes.readUInt32LE(4) === 2, "asset is not glTF 2.0");
  assert(bytes.readUInt32LE(8) === bytes.byteLength, "GLB length is invalid");
  const jsonLength = bytes.readUInt32LE(12);
  assert(bytes.readUInt32LE(16) === 0x4e4f534a, "GLB JSON chunk is missing");
  const binHeader = 20 + jsonLength;
  assert(
    bytes.readUInt32LE(binHeader + 4) === 0x004e4942,
    "GLB binary chunk is missing",
  );
  const binLength = bytes.readUInt32LE(binHeader);
  return {
    json: JSON.parse(bytes.subarray(20, 20 + jsonLength).toString("utf8")),
    bin: bytes.subarray(binHeader + 8, binHeader + 8 + binLength),
  };
}

function geometryStats(gltf) {
  let triangles = 0;
  let drawCalls = 0;
  for (const mesh of gltf.meshes ?? []) {
    for (const primitive of mesh.primitives ?? []) {
      drawCalls += 1;
      const accessorIndex = primitive.indices ?? primitive.attributes?.POSITION;
      const count = gltf.accessors?.[accessorIndex]?.count ?? 0;
      triangles += Math.floor(count / 3);
    }
  }
  return { drawCalls, triangles };
}

function assertInsideSourceRoot(path) {
  const pathFromRoot = relative(sourceRoot, path);
  assert(
    pathFromRoot !== "" &&
      pathFromRoot !== ".." &&
      !pathFromRoot.startsWith(`..${sep}`) &&
      resolve(sourceRoot, pathFromRoot) === path,
    `source path escapes ${sourceRoot}`,
  );
}

function assertUnique(values, label) {
  assert(new Set(values).size === values.length, `duplicate ${label}`);
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}
