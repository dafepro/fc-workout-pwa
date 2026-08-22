"use client";

import type { ComponentType } from "react";
import {
  TeamCanvasBoard,
  type TeamCanvasStampUnlockPort,
} from "../../team-canvas/components/TeamCanvasBoard";
import { teamCanvasStamp } from "../../team-canvas/catalog";
import { availableRewardCount } from "../../team-canvas/model";
import { useTeamCanvas } from "../../team-canvas/state";

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
  const Canvas = adapter.Canvas;
  const connected =
    canvas.connectedStatus === "ready" && canvas.connectedProjection;
  const stampUnlocks: TeamCanvasStampUnlockPort = {
    availableCount: connected
      ? connected.availableRewards
      : availableRewardCount(canvas.state),
    choices: connected
      ? connected.stampChoices
      : canvas.localSettings.stampChoices.map(teamCanvasStamp),
    unlock: canvas.chooseStamp,
  };
  return (
    <Canvas
      showDeveloperTools={false}
      todayHref="/"
      stampUnlocks={stampUnlocks}
    />
  );
}
