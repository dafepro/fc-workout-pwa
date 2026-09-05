import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

const projectRoot = process.cwd();
const source = JSON.parse(
  await readFile(
    resolve(projectRoot, "content/avatar/reference-library.json"),
    "utf8",
  ),
);
const catalog = JSON.parse(
  await readFile(
    resolve(projectRoot, "public/avatar/catalog/avatar-catalog.reference.json"),
    "utf8",
  ),
);
const requiredBaseNodes = [
  "hips",
  "spine",
  "chest",
  "neck",
  "head",
  "upper_arm_l",
  "lower_arm_l",
  "hand_l",
  "upper_arm_r",
  "lower_arm_r",
  "hand_r",
  "upper_leg_l",
  "lower_leg_l",
  "foot_l",
  "upper_leg_r",
  "lower_leg_r",
  "foot_r",
  "socket_head",
  "socket_chest",
  "socket_hips",
  "socket_upper_leg_l",
  "socket_upper_leg_r",
  "socket_foot_l",
  "socket_foot_r",
];
const requiredAnimations = ["idle_default", "walk", "run", "celebration_jump"];

assert(catalog.schemaVersion === source.schemaVersion, "schema version drift");
assert(
  catalog.catalogVersion === source.catalogVersion,
  "catalog version drift",
);
assert(catalog.rigVersion === source.rigVersion, "rig version drift");
assert(
  catalog.items.length === source.items.length,
  "catalog item count drift",
);
assert(
  new Set(catalog.items.map(({ id }) => id)).size === catalog.items.length,
  "duplicate catalog item ID",
);

for (const item of catalog.items) {
  const sourceItem = source.items.find(({ id }) => id === item.id);
  assert(sourceItem, `compiled item ${item.id} has no source`);
  const asset = item.assets?.lod0;
  assert(asset, `${item.id} has no lod0 asset`);
  assert(
    asset.url === `/avatar/assets/${asset.sha256}.glb`,
    `${item.id} asset URL is not content addressed`,
  );
  const bytes = await readFile(
    resolve(projectRoot, "public", asset.url.slice(1)),
  );
  assert(
    bytes.byteLength === asset.bytes,
    `${item.id} byte size does not match`,
  );
  assert(
    createHash("sha256").update(bytes).digest("hex") === asset.sha256,
    `${item.id} content hash does not match`,
  );

  const gltf = parseGLB(bytes);
  const nodes = gltf.nodes ?? [];
  const itemNode = nodes.find(({ extras }) => extras?.itemId === item.id);
  assert(itemNode, `${item.id} GLB metadata does not identify the item`);
  assert(
    itemNode.extras.rigVersion === catalog.rigVersion,
    `${item.id} GLB rig version does not match`,
  );
  const stats = geometryStats(gltf);
  assert(stats.triangles <= 50_000, `${item.id} exceeds the triangle budget`);
  assert(stats.drawCalls <= 30, `${item.id} exceeds the draw-call budget`);

  if (item.kind === "base") {
    const nodeNames = new Set(nodes.map(({ name }) => name));
    for (const name of requiredBaseNodes) {
      assert(nodeNames.has(name), `${item.id} is missing ${name}`);
    }
    const animationNames = new Set(
      (gltf.animations ?? []).map(({ name }) => name),
    );
    for (const name of requiredAnimations) {
      assert(animationNames.has(name), `${item.id} is missing ${name}`);
    }
  } else {
    assert(
      nodes.some(({ extras }) => typeof extras?.socket === "string"),
      `${item.id} has no socket attachment`,
    );
    if (item.materialMode === "tint1") {
      assert(
        nodes.some(({ extras }) => extras?.tintable === true),
        `${item.id} has no tintable mesh`,
      );
    }
  }
}

console.log(
  `Validated ${catalog.items.length} content-addressed avatar assets`,
);

function parseGLB(bytes) {
  assert(bytes.readUInt32LE(0) === 0x46546c67, "asset is not a GLB");
  assert(bytes.readUInt32LE(4) === 2, "asset is not glTF 2.0");
  assert(bytes.readUInt32LE(8) === bytes.byteLength, "GLB length is invalid");
  const jsonLength = bytes.readUInt32LE(12);
  assert(bytes.readUInt32LE(16) === 0x4e4f534a, "GLB JSON chunk is missing");
  return JSON.parse(bytes.subarray(20, 20 + jsonLength).toString("utf8"));
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
  return { triangles, drawCalls };
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}
