import { prepareWorldAssets } from "./team-world-assets.mjs";
const root = new URL("../", import.meta.url);
const source = new URL(
  "./",
  import.meta.resolve("@zmap/avatar-studio/assets/catalog.json"),
);
await prepareWorldAssets(root, source);
