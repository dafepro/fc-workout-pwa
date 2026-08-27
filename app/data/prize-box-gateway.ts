export type PrizeBoxSource =
  | "daily_check_in"
  | "plan_participation_3"
  | "plan_completion_7";
export type PrizeRarity = "common" | "uncommon" | "rare" | "epic";
export type PrizeDestination = "avatar" | "team_lounge";

export interface PrizeItem {
  id: string;
  kind: "avatar_part" | "canvas_stamp" | "canvas_prop";
  slot: string;
  assetId: string;
  label: string;
  catalogVersion: number;
  rarity: PrizeRarity;
  destination: PrizeDestination;
}

export interface PrizeBox {
  id: string;
  state: "unopened";
  source: PrizeBoxSource;
  earnedAt: string;
}

export interface PrizeHistoryItem {
  item: PrizeItem;
  source: string;
  unlockedAt: string;
  viewedAt?: string;
}

export interface PrizeBoxOverview {
  day: string;
  dailyState: "available" | "claimed" | "collection_complete";
  readyCount: number;
  earnedTotal: number;
  openedTotal: number;
  unopened: PrizeBox[];
  recent: PrizeHistoryItem[];
}

export interface OpenedPrizeBox {
  id: string;
  state: "claimed" | "collection_complete";
  source: PrizeBoxSource;
  day: string;
  timeZone: string;
  item?: PrizeItem;
  claimedAt: string;
}

export interface PrizeBoxGateway {
  overview(): Promise<PrizeBoxOverview>;
  claimDaily(idempotencyKey: string): Promise<PrizeBox>;
  open(boxID: string, idempotencyKey: string): Promise<OpenedPrizeBox>;
}

export async function loadPrizeBoxOverview(): Promise<PrizeBoxOverview> {
  const response = await fetch("/api/zoomigo/v1/me/prize-boxes", {
    cache: "no-store",
  });
  if (!response.ok) throw new Error("Prize boxes could not be loaded.");
  const body: unknown = await response.json();
  if (!isPrizeBoxOverview(body)) {
    throw new Error("The Prize boxes response was invalid.");
  }
  return body;
}

export async function claimDailyPrizeBox(
  idempotencyKey: string,
): Promise<PrizeBox> {
  const response = await fetch("/api/zoomigo/v1/me/prize-boxes/claim-daily", {
    method: "POST",
    headers: { "Idempotency-Key": idempotencyKey },
  });
  if (!response.ok) throw new Error("Today's prize box could not be claimed.");
  const body = (await response.json()) as { box?: unknown };
  if (!isPrizeBox(body.box)) throw new Error("The claimed box was invalid.");
  return body.box;
}

export async function openPrizeBox(
  boxID: string,
  idempotencyKey: string,
): Promise<OpenedPrizeBox> {
  if (!OPAQUE_ID.test(boxID)) throw new Error("The prize box was invalid.");
  const response = await fetch(
    `/api/zoomigo/v1/me/prize-boxes/${encodeURIComponent(boxID)}/open`,
    { method: "POST", headers: { "Idempotency-Key": idempotencyKey } },
  );
  if (!response.ok) throw new Error("That prize box could not be opened.");
  const body = (await response.json()) as { claim?: unknown };
  if (!isOpenedPrizeBox(body.claim)) {
    throw new Error("The opened prize box was invalid.");
  }
  return body.claim;
}

export const connectedPrizeBoxGateway: PrizeBoxGateway = {
  overview: loadPrizeBoxOverview,
  claimDaily: claimDailyPrizeBox,
  open: openPrizeBox,
};

const DAY = /^\d{4}-\d{2}-\d{2}$/;
const IDENTIFIER = /^[a-z0-9][a-z0-9-]{0,63}$/;
const OPAQUE_ID = /^[a-z0-9][a-z0-9_-]{0,79}$/;

function isPrizeBoxOverview(value: unknown): value is PrizeBoxOverview {
  if (!value || typeof value !== "object") return false;
  const overview = value as Record<string, unknown>;
  return (
    typeof overview.day === "string" &&
    DAY.test(overview.day) &&
    (overview.dailyState === "available" ||
      overview.dailyState === "claimed" ||
      overview.dailyState === "collection_complete") &&
    isCount(overview.readyCount) &&
    isCount(overview.earnedTotal) &&
    isCount(overview.openedTotal) &&
    Array.isArray(overview.unopened) &&
    overview.unopened.every(isPrizeBox) &&
    overview.readyCount === overview.unopened.length &&
    Array.isArray(overview.recent) &&
    overview.recent.length <= 3 &&
    overview.recent.every(isPrizeHistoryItem)
  );
}

function isPrizeBox(value: unknown): value is PrizeBox {
  if (!value || typeof value !== "object") return false;
  const box = value as Record<string, unknown>;
  return (
    typeof box.id === "string" &&
    OPAQUE_ID.test(box.id) &&
    box.state === "unopened" &&
    isPrizeBoxSource(box.source) &&
    typeof box.earnedAt === "string" &&
    Number.isFinite(Date.parse(box.earnedAt))
  );
}

function isPrizeHistoryItem(value: unknown): value is PrizeHistoryItem {
  if (!value || typeof value !== "object") return false;
  const history = value as Record<string, unknown>;
  return (
    isPrizeItem(history.item) &&
    typeof history.source === "string" &&
    typeof history.unlockedAt === "string" &&
    Number.isFinite(Date.parse(history.unlockedAt)) &&
    (history.viewedAt === undefined ||
      (typeof history.viewedAt === "string" &&
        Number.isFinite(Date.parse(history.viewedAt))))
  );
}

function isOpenedPrizeBox(value: unknown): value is OpenedPrizeBox {
  if (!value || typeof value !== "object") return false;
  const claim = value as Record<string, unknown>;
  return (
    typeof claim.id === "string" &&
    OPAQUE_ID.test(claim.id) &&
    (claim.state === "claimed" || claim.state === "collection_complete") &&
    isPrizeBoxSource(claim.source) &&
    typeof claim.day === "string" &&
    DAY.test(claim.day) &&
    typeof claim.timeZone === "string" &&
    claim.timeZone.length > 0 &&
    typeof claim.claimedAt === "string" &&
    Number.isFinite(Date.parse(claim.claimedAt)) &&
    (claim.state === "collection_complete"
      ? claim.item === undefined
      : isPrizeItem(claim.item))
  );
}

export function isPrizeItem(value: unknown): value is PrizeItem {
  if (!value || typeof value !== "object") return false;
  const item = value as Record<string, unknown>;
  return (
    typeof item.id === "string" &&
    IDENTIFIER.test(item.id) &&
    (item.kind === "avatar_part" ||
      item.kind === "canvas_stamp" ||
      item.kind === "canvas_prop") &&
    typeof item.slot === "string" &&
    IDENTIFIER.test(item.slot) &&
    typeof item.assetId === "string" &&
    IDENTIFIER.test(item.assetId) &&
    typeof item.label === "string" &&
    item.label.length > 0 &&
    Number.isSafeInteger(item.catalogVersion) &&
    (item.rarity === "common" ||
      item.rarity === "uncommon" ||
      item.rarity === "rare" ||
      item.rarity === "epic") &&
    (item.destination === "avatar" || item.destination === "team_lounge")
  );
}

function isPrizeBoxSource(value: unknown): value is PrizeBoxSource {
  return (
    value === "daily_check_in" ||
    value === "plan_participation_3" ||
    value === "plan_completion_7"
  );
}

function isCount(value: unknown): value is number {
  return Number.isSafeInteger(value) && Number(value) >= 0;
}
