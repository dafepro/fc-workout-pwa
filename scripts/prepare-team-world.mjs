import { cp, mkdir } from "node:fs/promises";
const root = new URL("../", import.meta.url);
const source = new URL(
  "./",
  import.meta.resolve("@zmap/avatar-studio/assets/catalog.json"),
);
const target = new URL("public/team-world-assets/v0.1.1/", root);
await mkdir(target, { recursive: true });
for (const name of ["catalog.json", "models", "action", "wield"])
  await cp(new URL(name, source), new URL(name, target), { recursive: true });
await cp(
  new URL("assets/team-world/ball-cannon.glb", root),
  new URL("ball-cannon.glb", target),
);

await cp(
  new URL("assets/team-world/kenney/", root),
  new URL("public/team-world-assets/kenney/", root),
  { recursive: true },
);

const campus = new URL("public/team-world-assets/campus-v2/", root);
await mkdir(campus, { recursive: true });
await cp(
  new URL("assets/team-world/campus/models/team-campus.glb", root),
  new URL("team-campus.glb", campus),
);

for (const name of ["pitch-goal-v2.glb", "pitch-scoreboard-v2.glb"])
  await cp(
    new URL(`assets/team-world/campus/models/${name}`, root),
    new URL(name, campus),
  );
