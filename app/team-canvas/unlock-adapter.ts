import type { PlayerUnlock } from "../data/unlock-inventory-gateway";
import { findTeamCanvasStamp } from "./catalog";
import type { TeamCanvasStampUnlockPort } from "../player/team-canvas/widget-contract";

export const INCLUDED_CANVAS_STAMP_IDS = [
  "bolt",
  "fire",
  "star",
  "soccer",
  "spark-cleat",
  "zoomigo-mark",
] as const;

export type CanvasUnlockInventory = {
  state: "loading" | "error" | "ready";
  items: PlayerUnlock[];
};

export function createConnectedStampUnlockPort({
  inventory,
  availableCount,
  developerAssetIDs = [],
  place,
  view,
}: {
  inventory: CanvasUnlockInventory;
  availableCount: number;
  developerAssetIDs?: string[];
  place: TeamCanvasStampUnlockPort["unlock"];
  view(itemIDs: string[]): void | Promise<void>;
}): TeamCanvasStampUnlockPort {
  const earned = inventory.state === "ready" ? inventory.items : [];
  const assetIDs = [
    ...INCLUDED_CANVAS_STAMP_IDS,
    ...earned.map(({ item }) => item.assetId),
    ...developerAssetIDs,
  ];
  const choices = [...new Set(assetIDs)]
    .map(findTeamCanvasStamp)
    .filter((stamp) => stamp !== undefined);
  const newUnlocks = earned.filter(
    ({ item, viewedAt }) => !viewedAt && findTeamCanvasStamp(item.assetId),
  );

  return {
    availableCount,
    choices,
    status: inventory.state,
    newAssetIDs: newUnlocks.map(({ item }) => item.assetId),
    unlock: place,
    viewNew: () => view(newUnlocks.map(({ item }) => item.id)),
  };
}
