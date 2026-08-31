import {
  PrizeBoxGatewayError,
  type PrizeBox,
  type PrizeBoxClaim,
  type PrizeBoxGateway,
  type PrizeBoxOverview,
  type PrizeItem,
  type PrizeItemKind,
  type PrizeUnlock,
} from "../data/prize-box-gateway";

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

export function createUnhostedPrototypePrizeBoxGateway(): PrizeBoxGateway {
  return new UnhostedPrototypePrizeBoxGateway();
}

class UnhostedPrototypePrizeBoxGateway implements PrizeBoxGateway {
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

  async inventory(kinds?: readonly PrizeItemKind[]): Promise<PrizeUnlock[]> {
    if (!this.unlock || (kinds && !kinds.includes(this.unlock.item.kind))) {
      return [];
    }
    return [this.unlock];
  }

  async markViewed(itemId: string): Promise<PrizeUnlock> {
    if (!this.unlock || this.unlock.item.id !== itemId) {
      throw new PrizeBoxGatewayError(
        "unlock_not_found",
        "That unlocked item is unavailable.",
      );
    }
    this.unlock = { ...this.unlock, viewedAt: new Date().toISOString() };
    return this.unlock;
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
