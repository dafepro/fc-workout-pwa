"use client";

import {
  lazy,
  Suspense,
  useEffect,
  useRef,
  useState,
  type ComponentType,
} from "react";
import { TeamCanvasBoard } from "../../team-canvas/components/TeamCanvasBoard";
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
import { useAvatarIdentity } from "../../state/avatar-identity-context";
import { migrateAvatarConfiguration } from "../../avatar/config";
import type {
  TeamCanvasStampUnlockPort,
  TeamCanvasWidgetContract,
} from "./widget-contract";
import { useOptionalAnalytics } from "../../../lib/analytics/AnalyticsProvider";
import { teamCanvasHealthProperties } from "../../team-canvas/realtime/telemetry";

export interface TeamCanvasWidgetAdapter {
  contractVersion: 1;
  Canvas: ComponentType<{
    host: TeamCanvasWidgetContract;
    showDeveloperTools?: boolean;
    todayHref?: string;
    stampUnlocks?: TeamCanvasStampUnlockPort;
  }>;
}

const builtInCanvasAdapter: TeamCanvasWidgetAdapter = {
  contractVersion: 1,
  Canvas: TeamCanvasBoard,
};

const TeamLoungeV2 = lazy(() =>
  import("../../team-lounge-v2/adapter").then((module) => ({
    default: module.TeamLoungeV2,
  })),
);

export function TeamCanvasWidget({
  adapter,
}: {
  adapter?: TeamCanvasWidgetAdapter;
}) {
  const canvas = useTeamCanvas();
  const dev = usePlayerDevSettings();
  const auth = useOptionalAuth();
  const avatarIdentity = useAvatarIdentity();
  const analytics = useOptionalAnalytics();
  const lastHealthSample = useRef(0);
  const selectedVersion = adapter ? "custom" : dev.settings.teamLoungeVersion;
  const selectedAdapter = adapter ?? builtInCanvasAdapter;
  const Canvas = adapter
    ? adapter.Canvas
    : selectedVersion === "v2"
      ? TeamLoungeV2
      : builtInCanvasAdapter.Canvas;
  const connected =
    canvas.connectedStatus === "ready" && canvas.connectedProjection;
  const connectedTeamID = connected ? connected.team.id : null;
  const inventoryPlayerID = auth?.currentPlayerID ?? null;
  const [inventory, setInventory] = useState<{
    playerID: string | null;
    state: "loading" | "error" | "ready";
    items: PlayerUnlock[];
  }>({ playerID: null, state: "loading", items: [] });
  const [reducedMotion, setReducedMotion] = useState(false);

  useEffect(() => {
    const matchMedia = window.matchMedia;
    if (typeof matchMedia !== "function") return;
    const media = matchMedia.call(window, "(prefers-reduced-motion: reduce)");
    const update = () => setReducedMotion(media.matches);
    update();
    media.addEventListener?.("change", update);
    return () => media.removeEventListener?.("change", update);
  }, []);

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
  useEffect(() => {
    if (!analytics || canvas.connectionState === "local") return;
    const now = Date.now();
    if (lastHealthSample.current && now - lastHealthSample.current < 30_000)
      return;
    lastHealthSample.current = now;
    analytics.track(
      "team_canvas_health_sample",
      teamCanvasHealthProperties(canvas.connectionState, canvas.telemetry),
    );
  }, [analytics, canvas.connectionState, canvas.telemetry]);
  const host: TeamCanvasWidgetContract = {
    version: selectedAdapter.contractVersion,
    identity: {
      teamID:
        canvas.connectedProjection?.team.id ??
        auth?.currentTeamID ??
        canvas.state.teamId,
      playerID:
        auth?.currentPlayerID ?? avatarIdentity.currentPlayerID ?? "player",
      avatar: migrateAvatarConfiguration(avatarIdentity.avatarConfig),
    },
    access: {
      state: canvas.connectedStatus,
      error: canvas.connectedError,
    },
    room: {
      localState: canvas.state,
      projection: canvas.connectedProjection,
      localSettings: canvas.localSettings,
      selectedPieceID: canvas.selectedPieceId,
    },
    inventory: stampUnlocks,
    actions: {
      moveAvatar: canvas.moveAvatar,
      placeStamp: canvas.chooseStamp,
      togglePiece: canvas.togglePiece,
      editPiece: canvas.editPiece,
      deletePiece: canvas.deletePiece,
      clearPiece: canvas.clearPiece,
      saveSettings: canvas.saveSettings,
    },
    lifecycle: {
      connection: canvas.connectionState,
      reducedMotion,
    },
    telemetry: canvas.telemetry,
  };
  return (
    <Suspense fallback={<p className="tc-opening">Opening Team Lounge…</p>}>
      <Canvas
        key={selectedVersion}
        host={host}
        showDeveloperTools={dev.enabled}
        todayHref="/"
        stampUnlocks={stampUnlocks}
      />
    </Suspense>
  );
}
