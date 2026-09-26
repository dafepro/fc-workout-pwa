"use client";
import { qualityCopy } from "../../content/quality-copy";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { AVATAR_LAYERS } from "../../avatar/catalog";
import { collectionReturn } from "../../prizes/navigation";
import type { PrizeItem } from "../../data/prize-box-gateway";
import { useEffect, useState } from "react";
import { AvatarBuilder } from "../../avatar/AvatarBuilder";
import { copy } from "../../content/copy";
import { developmentBuild } from "../../build-profile";
import { unlockDevelopmentCatalogItems } from "../../development/catalog-unlocks";
import { useAuth } from "../../state/auth-context";
import { LoadError } from "../../components/LoadError";

export default function AvatarStudioPage() {
  const { avatarConfig, runtime, saveAvatar, currentPlayerID } = useAuth();
  const router = useRouter();
  const search = useSearchParams();
  const requestedItem = search.get("item");
  const fromPrizes = search.get("from") === "prizes";
  const backToPrizes = collectionReturn(search.get("filter"), requestedItem);
  const [itemIntent, setItemIntent] = useState<PrizeItem>();
  const [gateway] = useState(() => runtime.prizeBoxes);
  const [unlockedOptionIDs, setUnlockedOptionIDs] = useState(
    () => new Set<string>(),
  );
  const [status, setStatus] = useState<"loading" | "ready" | "error">(
    "loading",
  );
  const [request, setRequest] = useState(0);

  useEffect(() => {
    let active = true;
    const inventory = async () => {
      if (developmentBuild) {
        await unlockDevelopmentCatalogItems().catch(() => undefined);
      }
      return gateway.inventory(["avatar_part"]);
    };
    void inventory()
      .then((items) => {
        if (!active) return;
        setUnlockedOptionIDs(new Set(items.map(({ item }) => item.assetId)));
        const owned = items.find(({ item }) => item.id === requestedItem)?.item;
        setItemIntent(
          owned &&
            AVATAR_LAYERS.some(
              (layer) =>
                layer.kind === owned.slot &&
                layer.options.some((option) => option.id === owned.assetId),
            )
            ? owned
            : undefined,
        );
        setStatus("ready");
        for (const unlock of items) {
          if (!unlock.viewedAt)
            void gateway.markViewed(unlock.item.id).catch(() => undefined);
        }
      })
      .catch(() => {
        if (active) setStatus("error");
      });
    return () => {
      active = false;
    };
  }, [gateway, request, requestedItem]);

  async function saveAndReturn(config: Parameters<typeof saveAvatar>[0]) {
    await saveAvatar(config);
    router.push(fromPrizes ? backToPrizes : "/me?avatar=saved");
  }

  return (
    <div className="page page--avatar-studio">
      <Link
        className="avatar-studio__back"
        href={fromPrizes ? backToPrizes : "/me"}
        aria-label={fromPrizes ? qualityCopy.backPrizes : copy.avatar.back}
        title={fromPrizes ? qualityCopy.backPrizes : copy.avatar.back}
      >
        <span aria-hidden="true">←</span>
        {fromPrizes ? qualityCopy.backPrizes : qualityCopy.backMe}
      </Link>
      {status === "ready" && requestedItem && !itemIntent ? (
        <p role="status">{qualityCopy.portraitUnavailable}</p>
      ) : null}
      {status === "error" ? (
        <LoadError
          message={copy.recovery.inventoryFailed}
          onRetry={() => {
            setStatus("loading");
            setRequest((value) => value + 1);
          }}
        />
      ) : status === "loading" ? (
        <p role="status">Loading your wardrobe…</p>
      ) : (
        <AvatarBuilder
          itemIntent={itemIntent}
          draftKey={`${currentPlayerID}/${runtime.currentTeam.id}/avatar`}
          config={avatarConfig}
          unlockedOptionIDs={unlockedOptionIDs}
          onSave={saveAndReturn}
        />
      )}
    </div>
  );
}
