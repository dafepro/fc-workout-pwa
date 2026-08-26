import type { ItemDefinition } from "@canvas-physics/core";
import {
  findTeamCanvasStamp,
  TEAM_CANVAS_STAMPS,
} from "../../team-canvas/catalog";
import type { StampAsset } from "../../team-canvas/model";

export const STAMP_DEFINITION_PREFIX = "zoomigo-stamp-";

export const LOUNGE_STAMP_ASSET_IDS = [
  "bolt",
  "fire",
  "star",
  "soccer",
  "spark-cleat",
  "zoomigo-mark",
  "shield",
  "target",
  "rainbow",
  "lion",
  "rocket",
  "sparkles",
] as const;

export function stampDefinitionID(assetID: string): string {
  return `${STAMP_DEFINITION_PREFIX}${assetID}`;
}

export function stampAssetIDFromDefinition(
  definitionID: string,
): string | null {
  if (!definitionID.startsWith(STAMP_DEFINITION_PREFIX)) return null;
  const assetID = definitionID.slice(STAMP_DEFINITION_PREFIX.length);
  return LOUNGE_STAMP_ASSET_IDS.includes(
    assetID as (typeof LOUNGE_STAMP_ASSET_IDS)[number],
  )
    ? assetID
    : null;
}

export function loungeStampAsset(assetID: string): StampAsset | undefined {
  if (!stampAssetIDFromDefinition(stampDefinitionID(assetID))) return undefined;
  return findTeamCanvasStamp(assetID);
}

export function loungeStampChoices(
  choices: readonly StampAsset[],
): StampAsset[] {
  const allowed = new Set(LOUNGE_STAMP_ASSET_IDS);
  return choices.filter(({ id }) => allowed.has(id as never));
}

export const loungeStampDefinitions: ItemDefinition[] =
  TEAM_CANVAS_STAMPS.filter(({ id }) =>
    LOUNGE_STAMP_ASSET_IDS.includes(id as never),
  ).map((asset) => ({
    definitionId: stampDefinitionID(asset.id),
    version: 1,
    displayName: `${asset.kind === "emoji" ? asset.label : asset.alt} stamp`,
    visual: {
      size: { width: 10, height: 10 },
      placeholder: { shape: "circle", color: 0xc9f31d },
      zIndex: 9,
    },
    colliders: [],
    defaultConfig: {},
    persistence: {
      transform: true,
      behaviorState: false,
      onRoomSleep: "pause",
    },
    complexity: "simple",
  }));
