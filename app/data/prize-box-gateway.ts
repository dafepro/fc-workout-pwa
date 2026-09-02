export type PrizeBoxSource =
  | "daily_check_in"
  | "plan_participation_3"
  | "plan_completion_7"
  | "included"
  | "staff_grant";
export type PrizeItemKind =
  | "avatar_part"
  | "lounge_stamp"
  | "lounge_prop"
  | "lounge_chat_pack";
export type PrizeRarity = "common" | "uncommon" | "rare" | "epic";

export interface PrizeItem {
  id: string;
  kind: PrizeItemKind;
  slot: string;
  assetId: string;
  label: string;
  catalogVersion: number;
  rarity: PrizeRarity;
  destination: "avatar" | "team_lounge";
}

export interface PrizeBox {
  id: string;
  source: PrizeBoxSource;
  earnedAt: string;
}

export interface PrizeUnlock {
  item: PrizeItem;
  source: PrizeBoxSource;
  unlockedAt: string;
  viewedAt?: string;
}

export interface PrizeBoxClaim {
  id: string;
  source: PrizeBoxSource;
  item?: PrizeItem;
  openedAt: string;
}

export interface PrizeBoxOverview {
  day: string;
  dailyState: "available" | "claimed" | "collection_complete";
  readyCount: number;
  earnedTotal: number;
  openedTotal: number;
  unopened: PrizeBox[];
  recent: PrizeUnlock[];
}

export interface PrizeBoxGateway {
  overview(): Promise<PrizeBoxOverview>;
  inventory(kinds?: readonly PrizeItemKind[]): Promise<PrizeUnlock[]>;
  markViewed(itemId: string): Promise<PrizeUnlock>;
  claimDaily(idempotencyKey: string): Promise<PrizeBox>;
  open(boxId: string, idempotencyKey: string): Promise<PrizeBoxClaim>;
}

export class PrizeBoxGatewayError extends Error {
  constructor(
    public readonly code: string,
    message: string,
  ) {
    super(message);
  }
}

class ConnectedPrizeBoxGateway implements PrizeBoxGateway {
  async overview(): Promise<PrizeBoxOverview> {
    return request<PrizeBoxOverview>("/api/zoomigo/v1/me/prize-boxes", {
      method: "GET",
    });
  }

  async inventory(
    kinds: readonly PrizeItemKind[] = [
      "avatar_part",
      "lounge_stamp",
      "lounge_prop",
      "lounge_chat_pack",
    ],
  ): Promise<PrizeUnlock[]> {
    const groups = await Promise.all(
      kinds.map((kind) =>
        request<{ items: PrizeUnlock[] }>(
          `/api/zoomigo/v1/me/unlocks?kind=${kind}`,
          { method: "GET" },
        ),
      ),
    );
    return groups
      .flatMap(({ items }) => items)
      .sort((left, right) => right.unlockedAt.localeCompare(left.unlockedAt));
  }

  async markViewed(itemId: string): Promise<PrizeUnlock> {
    return request<PrizeUnlock>(
      `/api/zoomigo/v1/me/unlocks/${encodeURIComponent(itemId)}/viewed`,
      { method: "POST" },
    );
  }

  async claimDaily(idempotencyKey: string): Promise<PrizeBox> {
    const result = await request<{ box: PrizeBox }>(
      "/api/zoomigo/v1/me/prize-boxes/claim-daily",
      mutation(idempotencyKey),
    );
    return result.box;
  }

  async open(boxId: string, idempotencyKey: string): Promise<PrizeBoxClaim> {
    const result = await request<{ claim: PrizeBoxClaim }>(
      `/api/zoomigo/v1/me/prize-boxes/${encodeURIComponent(boxId)}/open`,
      mutation(idempotencyKey),
    );
    return result.claim;
  }
}

export function createConnectedPrizeBoxGateway(): PrizeBoxGateway {
  return new ConnectedPrizeBoxGateway();
}

function mutation(idempotencyKey: string): RequestInit {
  return {
    method: "POST",
    headers: { "Idempotency-Key": idempotencyKey },
  };
}

async function request<T>(url: string, init: RequestInit): Promise<T> {
  const response = await fetch(url, init);
  if (response.ok) return (await response.json()) as T;
  let code = "prize_box_failed";
  let message = "Prize boxes could not be updated.";
  try {
    const body = (await response.json()) as {
      error?: { code?: string; message?: string };
    };
    code = body.error?.code ?? code;
    message = body.error?.message ?? message;
  } catch {
    // An intermediary may return HTML; player copy must remain safe and useful.
  }
  throw new PrizeBoxGatewayError(code, message);
}
