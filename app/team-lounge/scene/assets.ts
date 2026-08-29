import type { AssetManifest } from "@canvas-physics/client";

export const beachBoardwalkAssets: AssetManifest = {
  schemaVersion: 1,
  id: "zoomigo-beach-boardwalk",
  revision: "2026-08-27.1",
  sources: [
    {
      id: "lounge-background-source",
      src: "/team-lounge/beach-boardwalk-v1.png",
      required: true,
    },
    {
      id: "lounge-transparent-source",
      src: "/team-lounge/transparent.svg",
      required: true,
    },
    {
      id: "lounge-ball-source",
      src: "/team-lounge/beach-ball.svg",
      required: true,
    },
  ],
  textures: [
    { id: "lounge.background", sourceId: "lounge-background-source" },
    { id: "lounge.avatar", sourceId: "lounge-transparent-source" },
    { id: "lounge.ball", sourceId: "lounge-ball-source" },
  ],
};

export const starlightTrainingCampAssets: AssetManifest = {
  ...beachBoardwalkAssets,
  id: "zoomigo-starlight-training-camp-preview",
  revision: "2026-08-29.1",
  sources: beachBoardwalkAssets.sources.map((source) =>
    source.id === "lounge-background-source"
      ? { ...source, src: "/team-lounge/starlight-training-camp-v1.png" }
      : source,
  ),
};
