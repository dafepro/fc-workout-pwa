"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { AvatarBuilder } from "../../avatar/AvatarBuilder";
import { copy } from "../../content/copy";
import { useAuth } from "../../state/auth-context";
import { createPrizeBoxGateway } from "../../data/prize-box-gateway";

export default function AvatarStudioPage() {
  const { connected, avatarConfig, saveAvatar } = useAuth();
  const router = useRouter();
  const [gateway] = useState(() => createPrizeBoxGateway(connected));
  const [unlockedOptionIDs, setUnlockedOptionIDs] = useState(
    () => new Set<string>(),
  );

  useEffect(() => {
    let active = true;
    gateway
      .inventory(["avatar_part"])
      .then((items) => {
        if (!active) return;
        setUnlockedOptionIDs(new Set(items.map(({ item }) => item.assetId)));
        for (const unlock of items) {
          if (!unlock.viewedAt)
            void gateway.markViewed(unlock.item.id).catch(() => undefined);
        }
      })
      .catch(() => undefined);
    return () => {
      active = false;
    };
  }, [gateway]);

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
      <AvatarBuilder
        config={avatarConfig}
        unlockedOptionIDs={unlockedOptionIDs}
        onSave={saveAndReturn}
      />
    </div>
  );
}
