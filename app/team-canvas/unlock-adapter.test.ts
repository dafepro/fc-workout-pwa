import { describe, expect, it, vi } from "vitest";
import type { PlayerUnlock } from "../data/unlock-inventory-gateway";
import {
  INCLUDED_CANVAS_STAMP_IDS,
  createConnectedStampUnlockPort,
} from "./unlock-adapter";

const target: PlayerUnlock = {
  item: {
    id: "canvas-stamp-target",
    kind: "canvas_stamp",
    slot: "stamp",
    assetId: "target",
    label: "Target stamp",
    catalogVersion: 1,
  },
  source: "daily_drop",
  unlockedAt: "2026-08-24T14:00:00Z",
};

describe("Canvas stamp unlock adapter", () => {
  it("combines included and earned stamps without confusing ownership with placement slots", () => {
    const port = createConnectedStampUnlockPort({
      inventory: { state: "ready", items: [target] },
      availableCount: 2,
      place: vi.fn(),
      view: vi.fn(),
    });

    expect(port.availableCount).toBe(2);
    expect(port.choices.map(({ id }) => id)).toEqual([
      ...INCLUDED_CANVAS_STAMP_IDS,
      "target",
    ]);
    expect(port.newAssetIDs).toEqual(["target"]);
  });

  it("ignores removed catalog IDs and falls back to included stamps when inventory fails", () => {
    const retired = {
      ...target,
      item: { ...target.item, id: "canvas-stamp-retired", assetId: "retired" },
    };
    const failed = createConnectedStampUnlockPort({
      inventory: { state: "error", items: [retired] },
      availableCount: 1,
      place: vi.fn(),
      view: vi.fn(),
    });

    expect(failed.choices.map(({ id }) => id)).toEqual(
      INCLUDED_CANVAS_STAMP_IDS,
    );
    expect(failed.status).toBe("error");
  });
});
