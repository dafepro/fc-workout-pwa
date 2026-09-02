import { readFileSync } from "node:fs";
import { join } from "node:path";
import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type {
  PrizeItem,
  PrizeItemKind,
  PrizeRarity,
} from "../data/prize-box-gateway";
import { PrizeItemArt } from "./PrizeItemArt";

const kindByGoName: Record<string, PrizeItemKind> = {
  PrizeAvatarPart: "avatar_part",
  PrizeLoungeStamp: "lounge_stamp",
  PrizeLoungeProp: "lounge_prop",
  PrizeLoungeChatPack: "lounge_chat_pack",
};

const rarityByGoName: Record<string, PrizeRarity> = {
  PrizeCommon: "common",
  PrizeUncommon: "uncommon",
  PrizeRare: "rare",
  PrizeEpic: "epic",
};

function backendPrizeCatalog(): PrizeItem[] {
  const source = readFileSync(
    join(process.cwd(), "backend", "internal", "domain", "prize_catalog.go"),
    "utf8",
  );
  const rows = source.matchAll(
    /\{ID: "([^"]+)", Kind: (Prize\w+), Slot: "([^"]+)", AssetID: "([^"]+)", Label: "([^"]+)", CatalogVersion: (\d+), Rarity: (Prize\w+), Destination: (Prize\w+)\}/g,
  );

  return [...rows].map(
    ([, id, goKind, slot, assetId, label, version, goRarity, destination]) => ({
      id,
      kind: kindByGoName[goKind],
      slot,
      assetId,
      label,
      catalogVersion: Number(version),
      rarity: rarityByGoName[goRarity],
      destination:
        destination === "PrizeDestinationAvatar" ? "avatar" : "team_lounge",
    }),
  );
}

describe("PrizeItemArt", () => {
  it("renders canonical artwork for every server-authorized prize", () => {
    const catalog = backendPrizeCatalog();
    expect(catalog.length).toBeGreaterThan(0);

    for (const item of catalog) {
      const { container, unmount } = render(<PrizeItemArt item={item} />);
      const artwork = container.querySelector(`[data-prize-art="${item.id}"]`);

      expect(artwork, item.id).not.toBeNull();
      if (item.kind === "avatar_part") {
        expect(artwork?.querySelector("svg"), item.id).not.toBeNull();
      } else if (item.kind === "lounge_chat_pack") {
        expect(
          artwork?.querySelector(".prize-item-art__chat-pack"),
          item.id,
        ).not.toBeNull();
      } else {
        expect(
          artwork?.querySelector(".team-lounge__item-art"),
          item.id,
        ).not.toBeNull();
      }
      unmount();
    }
  });
});
