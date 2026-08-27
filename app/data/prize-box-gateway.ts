export type PrizeBoxSource =
  | "daily_check_in"
  | "plan_participation_3"
  | "plan_completion_7";
export type PrizeItemKind = "avatar_part" | "lounge_stamp" | "lounge_prop";
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
  inventory(): Promise<PrizeUnlock[]>;
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

class HTTPPrizeBoxGateway implements PrizeBoxGateway {
  async overview(): Promise<PrizeBoxOverview> {
    return request<PrizeBoxOverview>("/api/zoomigo/v1/me/prize-boxes", {
      method: "GET",
    });
  }

  async inventory(): Promise<PrizeUnlock[]> {
    const kinds: PrizeItemKind[] = [
      "avatar_part",
      "lounge_stamp",
      "lounge_prop",
    ];
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

const LOCAL_ITEM: PrizeItem = {
  id: "avatar-head-dog",
  kind: "avatar_part",
  slot: "head",
  assetId: "dog",
  label: "Rover the dog",
  catalogVersion: 1,
  rarity: "common",
  destination: "avatar",
};

class LocalPrizeBoxGateway implements PrizeBoxGateway {
  private box: PrizeBox | null = null;
  private unlock: PrizeUnlock | null = null;

  async overview(): Promise<PrizeBoxOverview> {
    return {
      day: new Date().toISOString().slice(0, 10),
      dailyState: this.box || this.unlock ? "claimed" : "available",
      readyCount: this.box ? 1 : 0,
      earnedTotal: this.box || this.unlock ? 1 : 0,
      openedTotal: this.unlock ? 1 : 0,
      unopened: this.box ? [this.box] : [],
      recent: this.unlock ? [this.unlock] : [],
    };
  }

  async inventory(): Promise<PrizeUnlock[]> {
    return this.unlock ? [this.unlock] : [];
  }

  async claimDaily(): Promise<PrizeBox> {
    this.box ??= {
      id: "prize_box_local_daily",
      source: "daily_check_in",
      earnedAt: new Date().toISOString(),
    };
    return this.box;
  }

  async open(boxId: string): Promise<PrizeBoxClaim> {
    if (!this.box || this.box.id !== boxId) {
      throw new PrizeBoxGatewayError(
        "prize_box_unavailable",
        "That prize box is unavailable.",
      );
    }
    const openedAt = new Date().toISOString();
    const source = this.box.source;
    this.unlock = { item: LOCAL_ITEM, source, unlockedAt: openedAt };
    this.box = null;
    return { id: boxId, source, item: LOCAL_ITEM, openedAt };
  }
}

export function createPrizeBoxGateway(connected: boolean): PrizeBoxGateway {
  return connected ? new HTTPPrizeBoxGateway() : new LocalPrizeBoxGateway();
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
