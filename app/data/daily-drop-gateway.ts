export type UnlockItemKind = "avatar_part" | "canvas_stamp";

export interface DailyDropItem {
  id: string;
  kind: UnlockItemKind;
  slot: string;
  assetId: string;
  label: string;
  catalogVersion: number;
}

export interface DailyDropClaim {
  id: string;
  state: "claimed" | "collection_complete";
  day: string;
  timeZone: string;
  item?: DailyDropItem;
  claimedAt: string;
}

export type DailyDropStatus =
  | { state: "available"; day: string }
  | { state: "claimed"; day: string; claim: DailyDropClaim }
  | {
      state: "collection_complete";
      day: string;
      claim?: DailyDropClaim;
    };

export interface DailyDropGateway {
  status(): Promise<DailyDropStatus>;
  claim(idempotencyKey: string): Promise<DailyDropClaim>;
}

const DAY = /^\d{4}-\d{2}-\d{2}$/;
const IDENTIFIER = /^[a-z0-9][a-z0-9-]{0,63}$/;
const OPAQUE_ID = /^[a-z0-9][a-z0-9_-]{0,79}$/;

export async function loadDailyDropStatus(): Promise<DailyDropStatus> {
  const response = await fetch("/api/zoomigo/v1/me/daily-drop", {
    cache: "no-store",
  });
  if (!response.ok) throw new Error("The daily gift could not be loaded.");
  const status = await response.json();
  if (!isDailyDropStatus(status)) {
    throw new Error("The daily gift response was invalid.");
  }
  return status;
}

export async function claimDailyDrop(
  idempotencyKey: string,
): Promise<DailyDropClaim> {
  const response = await fetch("/api/zoomigo/v1/me/daily-drop/claim", {
    method: "POST",
    headers: { "Idempotency-Key": idempotencyKey },
  });
  if (!response.ok) throw new Error("The daily gift could not be opened.");
  const body = (await response.json()) as { claim?: unknown };
  if (!isDailyDropClaim(body.claim)) {
    throw new Error("The daily gift response was invalid.");
  }
  return body.claim;
}

export const connectedDailyDropGateway: DailyDropGateway = {
  status: loadDailyDropStatus,
  claim: claimDailyDrop,
};

function isDailyDropStatus(value: unknown): value is DailyDropStatus {
  if (!value || typeof value !== "object") return false;
  const status = value as Record<string, unknown>;
  if (typeof status.day !== "string" || !DAY.test(status.day)) return false;
  if (status.state === "available") return status.claim === undefined;
  if (status.state === "claimed") {
    return isDailyDropClaim(status.claim) && status.claim.item !== undefined;
  }
  if (status.state === "collection_complete") {
    return status.claim === undefined || isDailyDropClaim(status.claim);
  }
  return false;
}

function isDailyDropClaim(value: unknown): value is DailyDropClaim {
  if (!value || typeof value !== "object") return false;
  const claim = value as Record<string, unknown>;
  if (
    typeof claim.id !== "string" ||
    !OPAQUE_ID.test(claim.id) ||
    (claim.state !== "claimed" && claim.state !== "collection_complete") ||
    typeof claim.day !== "string" ||
    !DAY.test(claim.day) ||
    typeof claim.timeZone !== "string" ||
    claim.timeZone.length === 0 ||
    typeof claim.claimedAt !== "string" ||
    !Number.isFinite(Date.parse(claim.claimedAt))
  ) {
    return false;
  }
  if (claim.state === "collection_complete") return claim.item === undefined;
  return isDailyDropItem(claim.item);
}

function isDailyDropItem(value: unknown): value is DailyDropItem {
  if (!value || typeof value !== "object") return false;
  const item = value as Record<string, unknown>;
  return (
    typeof item.id === "string" &&
    IDENTIFIER.test(item.id) &&
    (item.kind === "avatar_part" || item.kind === "canvas_stamp") &&
    typeof item.slot === "string" &&
    IDENTIFIER.test(item.slot) &&
    typeof item.assetId === "string" &&
    IDENTIFIER.test(item.assetId) &&
    typeof item.label === "string" &&
    item.label.length > 0 &&
    item.label.length <= 80 &&
    Number.isSafeInteger(item.catalogVersion) &&
    Number(item.catalogVersion) > 0
  );
}
