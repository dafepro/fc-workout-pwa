import type { AssetManifest } from "@canvas-physics/client";

export const beachBoardwalkAssets: AssetManifest = {
  schemaVersion: 1,
  id: "zoomigo-beach-boardwalk",
  revision: "2026-08-27.1",
  sources: [
    {
      id: "lounge-background-source",
      src: "/team-lounge-v2/beach-boardwalk-v1.png",
      required: true,
    },
    {
      id: "lounge-transparent-source",
      src: "/team-lounge-v2/transparent.svg",
      required: true,
    },
    {
      id: "lounge-ball-source",
      src: "/team-lounge-v2/beach-ball.svg",
      required: true,
    },
  ],
  textures: [
    {
      id: "lounge.background",
      sourceId: "lounge-background-source",
    },
    {
      id: "lounge.stamp.transparent",
      sourceId: "lounge-transparent-source",
    },
    {
      id: "lounge.ball",
      sourceId: "lounge-ball-source",
    },
  ],
};
