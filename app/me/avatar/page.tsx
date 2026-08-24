"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { AvatarBuilder } from "../../avatar/AvatarBuilder";
import { copy } from "../../content/copy";
import {
  loadUnlockInventory,
  markUnlockViewed,
  type PlayerUnlock,
} from "../../data/unlock-inventory-gateway";
import { useAuth } from "../../state/auth-context";

export default function AvatarStudioPage() {
  const { avatarConfig, saveAvatar } = useAuth();
  const router = useRouter();
  const [inventory, setInventory] = useState<
    | { state: "loading"; items: [] }
    | { state: "error"; items: [] }
    | { state: "ready"; items: PlayerUnlock[] }
  >({ state: "loading", items: [] });

  useEffect(() => {
    let active = true;
    void loadUnlockInventory("avatar_part")
      .then((items) => {
        if (active) setInventory({ state: "ready", items });
      })
      .catch(() => {
        if (active) setInventory({ state: "error", items: [] });
      });
    return () => {
      active = false;
    };
  }, []);

  async function saveAndReturn(config: Parameters<typeof saveAvatar>[0]) {
    await saveAvatar(config);
    router.push("/me?avatar=saved");
  }

  async function acknowledge(itemIDs: string[]) {
    const viewedAt = new Date().toISOString();
    await Promise.all(itemIDs.map((itemID) => markUnlockViewed(itemID)));
    setInventory((current) =>
      current.state === "ready"
        ? {
            state: "ready",
            items: current.items.map((unlock) =>
              itemIDs.includes(unlock.item.id)
                ? { ...unlock, viewedAt }
                : unlock,
            ),
          }
        : current,
    );
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
        inventory={inventory}
        onViewUnlocks={acknowledge}
        onSave={saveAndReturn}
      />
    </div>
  );
}
