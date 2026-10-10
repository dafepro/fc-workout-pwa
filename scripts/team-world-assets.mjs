import { createHash } from "node:crypto";
import { cp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";
import { isDeepStrictEqual } from "node:util";

const root = new URL("../", import.meta.url);
const campusProvenance = "assets/team-world/campus/PROVENANCE.md";
export const worldAssetSources = [
  {
    role: "collision",
    source: "app/team-world/world.json",
    provenance: campusProvenance,
  },
  {
    role: "campus",
    source: "assets/team-world/campus/models/team-campus.glb",
    publicName: "team-campus.glb",
    provenance: campusProvenance,
    limits: {
      bytes: 3 * 1024 * 1024,
      meshes: 80,
      triangles: 100000,
      textureBytes: 400000,
    },
  },
  {
    role: "pitchGoal",
    source: "assets/team-world/campus/models/pitch-goal-v2.glb",
    publicName: "pitch-goal-v2.glb",
    provenance: campusProvenance,
    limits: { bytes: 1024 * 1024, triangles: 10000 },
  },
  {
    role: "pitchScoreboard",
    source: "assets/team-world/campus/models/pitch-scoreboard-v2.glb",
    publicName: "pitch-scoreboard-v2.glb",
    provenance: campusProvenance,
    limits: { bytes: 1024 * 1024, triangles: 5000 },
  },
  {
    role: "cannon",
    source: "assets/team-world/ball-cannon.glb",
    publicName: "ball-cannon.glb",
    provenance: "assets/team-world/PROVENANCE.md",
    limits: { bytes: 2 * 1024 * 1024 },
  },
  {
    role: "lamp",
    source: "assets/team-world/kenney/lampSquareFloor.glb",
    publicName: "lampSquareFloor.glb",
    provenance: "assets/team-world/kenney/PROVENANCE.md",
  },
];
const hash = (bytes) => createHash("sha256").update(bytes).digest("hex");

function geometry(bytes) {
  if (
    bytes.length < 28 ||
    bytes.readUInt32LE(0) !== 0x46546c67 ||
    bytes.readUInt32LE(4) !== 2 ||
    bytes.readUInt32LE(8) !== bytes.length ||
    bytes.readUInt32LE(16) !== 0x4e4f534a
  )
    throw Error("Invalid embedded GLB");
  const end = 20 + bytes.readUInt32LE(12);
  if (
    end + 8 > bytes.length ||
    bytes.readUInt32LE(end + 4) !== 0x004e4942 ||
    end + 8 + bytes.readUInt32LE(end) !== bytes.length
  )
    throw Error("Invalid GLB binary chunk");
  const gltf = JSON.parse(bytes.subarray(20, end).toString());
  if (
    gltf.buffers?.length !== 1 ||
    gltf.buffers.some((b) => b.uri !== undefined) ||
    (gltf.images ?? []).some(
      (i) => i.uri !== undefined || !Number.isInteger(i.bufferView),
    )
  )
    throw Error("World GLBs must embed every buffer and image");
  const textureBytes = (gltf.images ?? []).reduce(
    (n, i) => n + gltf.bufferViews[i.bufferView].byteLength,
    0,
  );
  const triangles = gltf.meshes
    .flatMap((m) => m.primitives)
    .reduce((n, p) => {
      if ((p.mode ?? 4) !== 4) throw Error("World geometry must use triangles");
      return n + gltf.accessors[p.indices ?? p.attributes.POSITION].count / 3;
    }, 0);
  return { meshes: gltf.meshes.length, triangles, textureBytes };
}

export async function createWorldManifest(base = root) {
  const files = [];
  for (const entry of worldAssetSources) {
    const bytes = await readFile(new URL(entry.source, base));
    const metadata = entry.publicName ? geometry(bytes) : {};
    for (const [name, limit] of Object.entries(entry.limits ?? {})) {
      const value = name === "bytes" ? bytes.length : metadata[name];
      if (!Number.isFinite(value) || value > limit)
        throw Error(`${entry.role} exceeds its ${name} regression cap`);
    }
    files.push({
      ...entry,
      bytes: bytes.length,
      sha256: hash(bytes),
      provenanceSha256: hash(await readFile(new URL(entry.provenance, base))),
      ...metadata,
    });
  }
  const map = JSON.parse(
    await readFile(new URL(worldAssetSources[0].source, base)),
  );
  const payload = { schemaVersion: 1, mapId: map.id, files };
  return { ...payload, releaseDigest: hash(JSON.stringify(payload)) };
}

export async function verifyWorldManifest(base = root) {
  const expected = JSON.parse(
    await readFile(new URL("assets/team-world/manifest.json", base)),
  );
  const actual = await createWorldManifest(base);
  if (!isDeepStrictEqual(expected, actual))
    throw Error(
      "World asset manifest differs; explicitly rebuild and review it before packaging.",
    );
  return actual;
}

export async function prepareWorldAssets(base = root, avatarSource) {
  const manifest = await verifyWorldManifest(base);
  const target = new URL("public/team-world-assets/", base);
  await rm(target, { recursive: true, force: true });
  const owned = new URL(`app-${manifest.releaseDigest}/`, target);
  await mkdir(owned, { recursive: true });
  for (const entry of manifest.files.filter((f) => f.publicName))
    await cp(new URL(entry.source, base), new URL(entry.publicName, owned));
  await writeFile(
    new URL("asset-manifest.json", owned),
    JSON.stringify(manifest, null, 2) + "\n",
  );
  if (avatarSource) {
    const avatar = new URL("v0.1.4/", target);
    await mkdir(avatar, { recursive: true });
    for (const name of ["catalog.json", "models", "action", "wield"])
      await cp(new URL(name, avatarSource), new URL(name, avatar), {
        recursive: true,
      });
  }
  return manifest;
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  if (process.argv[2] === "--write") {
    await writeFile(
      new URL("assets/team-world/manifest.json", root),
      JSON.stringify(await createWorldManifest(), null, 2) + "\n",
    );
    console.log(
      "Wrote World asset manifest; review its source, provenance and hash changes.",
    );
  } else {
    await verifyWorldManifest();
    console.log("World asset manifest verified.");
  }
}
