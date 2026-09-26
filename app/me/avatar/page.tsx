"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
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
  }, [gateway, request]);

  async function saveAndReturn(config: Parameters<typeof saveAvatar>[0]) {
    await saveAvatar(config);
    router.push("/me?avatar=saved");
  }

  return (
    <div className="page page--avatar-studio">
      <Link
        className="avatar-studio__back"
        href="/me"
        aria-label={copy.avatar.back}
        title={copy.avatar.back}
      >
        <span aria-hidden="true">←</span>
      </Link>
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
          draftKey={`${currentPlayerID}/${runtime.currentTeam.id}/avatar`}
          config={avatarConfig}
          unlockedOptionIDs={unlockedOptionIDs}
          onSave={saveAndReturn}
        />
      )}
    </div>
  );
}
