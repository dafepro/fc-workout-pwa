import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { validateMap, supportAt, top, initialSimulation } from "zmap/core";
import { cannonBehavior, switchBehavior } from "zmap";
import { soccerBehavior } from "../../app/team-world/soccer.mjs";
import map from "../../app/team-world/world.json" with { type: "json" };

test("campus spans multiple viewports and preserves approved world interactions", () => {
  validateMap(map, [cannonBehavior, switchBehavior, soccerBehavior]);
  assert.equal(map.id, "team-world-campus-v2");
  assert.ok(map.bounds.width >= 130 && map.bounds.depth >= 130);
  assert.ok(map.surfaces.some((s) => s.id === "social-perch"));
  assert.ok(map.surfaces.some((s) => s.id === "bridge"));
  assert.ok(map.surfaces.filter((s) => s.slope).length >= 2);
  assert.ok(map.objects.some((o) => o.id === "courtyard-cannon"));
  assert.ok(map.objects.some((o) => o.id === "courtyard-lamp"));
  assert.equal(map.placementZones.length, 0);
  const state = initialSimulation(map, [
    cannonBehavior,
    switchBehavior,
    soccerBehavior,
  ]);
  assert.equal(Object.keys(state.toys).length, map.toys.length);
});

test("campus runtime asset stays within the reviewed geometry and download budgets", async () => {
  const glb = await readFile(
    new URL(
      "../../assets/team-world/campus/models/team-campus.glb",
      import.meta.url,
    ),
  );
  assert.ok(glb.length < 12 * 1024 * 1024, "Campus GLB exceeds 12 MiB");
  const json = JSON.parse(
    glb.subarray(20, 20 + glb.readUInt32LE(12)).toString(),
  );
  assert.ok(json.meshes.length <= 80, "Static campus exceeds 80 meshes");
  const triangles = json.meshes
    .flatMap((mesh) => mesh.primitives)
    .reduce(
      (count, primitive) => count + json.accessors[primitive.indices].count / 3,
      0,
    );
  assert.ok(triangles < 100000, `Campus has ${triangles} triangles`);
  assert.equal(
    json.images.length,
    3,
    "Stone, turf and wood share three texture images",
  );
});

test("every toy and spawn has physical support at the authored height", () => {
  for (const p of [map.spawn, ...map.toys.map((t) => t.home)]) {
    const surface = supportAt(map, p.x, p.z, p.y + 0.02);
    assert.ok(surface, JSON.stringify(p));
    assert.ok(Math.abs(top(surface, p.z) - p.y) < 0.025);
  }
});

test("pitch items are separate volumetric models within repeat-instance budgets", async () => {
  for (const [name, limit, part] of [
    ["pitch-goal-v2", 10000, "goal-net"],
    ["pitch-scoreboard-v2", 5000, "scoreboard-housing"],
  ]) {
    const bytes = await readFile(
      new URL(
        `../../assets/team-world/campus/models/${name}.glb`,
        import.meta.url,
      ),
    );
    assert.ok(bytes.length < 1024 * 1024, `${name} exceeds 1 MiB`);
    const gltf = JSON.parse(
      bytes.subarray(20, 20 + bytes.readUInt32LE(12)).toString(),
    );
    const triangles = gltf.meshes
      .flatMap((m) => m.primitives)
      .reduce((n, p) => n + gltf.accessors[p.indices].count / 3, 0);
    assert.ok(triangles < limit, `${name} has ${triangles} triangles`);
    const node = gltf.nodes.find((n) => n.name === part);
    assert.ok(node);
    const bounds =
      gltf.accessors[gltf.meshes[node.mesh].primitives[0].attributes.POSITION];
    assert.ok(bounds.max[0] - bounds.min[0] > 0.4);
    assert.ok(bounds.max[1] - bounds.min[1] > 0.4);
    assert.ok(
      bounds.max[2] - bounds.min[2] > 0.4,
      "Item must have actual depth",
    );
  }
});
