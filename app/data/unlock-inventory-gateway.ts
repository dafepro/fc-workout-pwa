import type { UnlockItemKind } from "./daily-drop-gateway";
import { isPrizeItem, type PrizeItem } from "./prize-box-gateway";

export interface PlayerUnlock {
  item: PrizeItem;
  source: string;
  unlockedAt: string;
  viewedAt?: string;
}

const IDENTIFIER = /^[a-z0-9][a-z0-9-]{0,63}$/;

export async function loadUnlockInventory(
  kind: UnlockItemKind,
): Promise<PlayerUnlock[]> {
  const response = await fetch(`/api/zoomigo/v1/me/unlocks?kind=${kind}`, {
    cache: "no-store",
  });
  if (!response.ok) throw new Error("Avatar rewards could not be loaded.");
  const body = (await response.json()) as { items?: unknown };
  if (
    !Array.isArray(body.items) ||
    !body.items.every((item) => isPlayerUnlock(item) && item.item.kind === kind)
  ) {
    throw new Error("Avatar rewards response was invalid.");
  }
  return body.items;
}

export async function markUnlockViewed(itemID: string): Promise<void> {
  if (!IDENTIFIER.test(itemID)) throw new Error("Invalid unlock identifier.");
  const response = await fetch(
    `/api/zoomigo/v1/me/unlocks/${encodeURIComponent(itemID)}/viewed`,
    { method: "POST" },
  );
  if (!response.ok)
    throw new Error("Avatar reward could not be marked viewed.");
}

function isPlayerUnlock(value: unknown): value is PlayerUnlock {
  if (!value || typeof value !== "object") return false;
  const unlock = value as Record<string, unknown>;
  if (!unlock.item || typeof unlock.item !== "object") return false;
  return (
    isPrizeItem(unlock.item) &&
    typeof unlock.source === "string" &&
    typeof unlock.unlockedAt === "string" &&
    Number.isFinite(Date.parse(unlock.unlockedAt)) &&
    (unlock.viewedAt === undefined ||
      (typeof unlock.viewedAt === "string" &&
        Number.isFinite(Date.parse(unlock.viewedAt))))
  );
}
