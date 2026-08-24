"use client";

import { useEffect, useState, type ComponentType } from "react";
import {
  TeamCanvasBoard,
  type TeamCanvasStampUnlockPort,
} from "../../team-canvas/components/TeamCanvasBoard";
import { teamCanvasStamp } from "../../team-canvas/catalog";
import { availableRewardCount } from "../../team-canvas/model";
import { useTeamCanvas } from "../../team-canvas/state";
import { usePlayerDevSettings } from "../dev/PlayerDevSettings";
import {
  loadUnlockInventory,
  markUnlockViewed,
  type PlayerUnlock,
} from "../../data/unlock-inventory-gateway";
import { createConnectedStampUnlockPort } from "../../team-canvas/unlock-adapter";
import { useOptionalAuth } from "../../state/auth-context";

export interface TeamCanvasWidgetAdapter {
  Canvas: ComponentType<{
    showDeveloperTools?: boolean;
    todayHref?: string;
    stampUnlocks?: TeamCanvasStampUnlockPort;
  }>;
}

const builtInCanvasAdapter: TeamCanvasWidgetAdapter = {
  Canvas: TeamCanvasBoard,
};

export function TeamCanvasWidget({
  adapter = builtInCanvasAdapter,
}: {
  adapter?: TeamCanvasWidgetAdapter;
}) {
  const canvas = useTeamCanvas();
  const dev = usePlayerDevSettings();
  const auth = useOptionalAuth();
  const Canvas = adapter.Canvas;
  const connected =
    canvas.connectedStatus === "ready" && canvas.connectedProjection;
  const connectedTeamID = connected ? connected.team.id : null;
  const inventoryPlayerID = auth?.currentPlayerID ?? null;
  const [inventory, setInventory] = useState<{
    playerID: string | null;
    state: "loading" | "error" | "ready";
    items: PlayerUnlock[];
  }>({ playerID: null, state: "loading", items: [] });

  useEffect(() => {
    if (!connectedTeamID || !inventoryPlayerID) return;
    let active = true;
    void loadUnlockInventory("canvas_stamp")
      .then((items) => {
        if (active)
          setInventory({ playerID: inventoryPlayerID, state: "ready", items });
      })
      .catch(() => {
        if (active)
          setInventory({
            playerID: inventoryPlayerID,
            state: "error",
            items: [],
          });
      });
    return () => {
      active = false;
    };
  }, [connectedTeamID, inventoryPlayerID]);

  async function viewNew(itemIDs: string[]) {
    if (itemIDs.length === 0) return;
    const viewedAt = new Date().toISOString();
    await Promise.all(itemIDs.map((itemID) => markUnlockViewed(itemID)));
    setInventory((current) => ({
      ...current,
      items: current.items.map((unlock) =>
        itemIDs.includes(unlock.item.id) ? { ...unlock, viewedAt } : unlock,
      ),
    }));
  }

  const stampUnlocks: TeamCanvasStampUnlockPort = connected
    ? createConnectedStampUnlockPort({
        inventory:
          inventory.playerID === inventoryPlayerID
            ? inventory
            : { state: "loading", items: [] },
        availableCount: connected.availableRewards,
        developerAssetIDs: connected.developerControlsEnabled
          ? connected.settings.stampChoices
          : [],
        place: canvas.chooseStamp,
        view: viewNew,
      })
    : {
        availableCount: availableRewardCount(canvas.state),
        choices: canvas.localSettings.stampChoices.map(teamCanvasStamp),
        unlock: canvas.chooseStamp,
      };
  return (
    <Canvas
      showDeveloperTools={dev.enabled}
      todayHref="/"
      stampUnlocks={stampUnlocks}
    />
  );
}
