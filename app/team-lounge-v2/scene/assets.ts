import type { AssetManifest } from "@canvas-physics/client";

export const beachBoardwalkAssets: AssetManifest = {
  schemaVersion: 1,
  id: "zoomigo-beach-boardwalk",
  revision: "2026-08-25.1",
  sources: [
    {
      id: "lounge-background-source",
      src: "/team-lounge-v2/beach-boardwalk-v1.png",
      required: true,
    },
  ],
  textures: [
    {
      id: "lounge.background",
      sourceId: "lounge-background-source",
    },
  ],
};
