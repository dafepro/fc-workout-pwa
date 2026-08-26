"use client";

import { useEffect, useRef } from "react";
import type { CanvasRuntime } from "@canvas-physics/client";
import { prepareTeamLoungeJoin } from "./data/lounge-gateway";
import type { LocalLoungeCanvasState } from "./LocalLoungeCanvas";
import { beachBoardwalkAssets } from "./scene/assets";
import { beachBoardwalkDefinitions } from "./scene/beach-boardwalk";

export function SharedLoungeCanvas({
  teamID,
  reducedMotion,
  onStateChange,
  onPresenceChange,
}: {
  teamID: string;
  reducedMotion: boolean;
  onStateChange(state: LocalLoungeCanvasState): void;
  onPresenceChange(count: number): void;
}) {
  const mountRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const mount = mountRef.current;
    if (!mount) return;
    let disposed = false;
    let runtime: CanvasRuntime | undefined;
    let unsubscribeLifecycle: () => void = () => undefined;
    let unsubscribePresence: () => void = () => undefined;
    onStateChange("loading");

    void (async () => {
      const join = await prepareTeamLoungeJoin(teamID);
      const { CanvasRuntime: Runtime } = await import("@canvas-physics/client");
      if (disposed) return;
      runtime = new Runtime({
        roomId: join.roomID,
        serverUrl: join.serverURL,
        credentialProvider: join.credentialProvider,
        mount,
        definitions: beachBoardwalkDefinitions,
        assets: beachBoardwalkAssets,
        scene: {
          background: 0x63c9dc,
          resolution: Math.min(devicePixelRatio, 2),
        },
        pointer: {
          mode: "avatarDrag",
          deadZonePx: 2,
          grabRadiusPx: 36,
          flick: reducedMotion
            ? false
            : {
                sampleWindowMs: 100,
                minimumSpeedPxPerSecond: 320,
                fullSpeedPxPerSecond: 1_250,
              },
        },
        onError: () => {
          if (!disposed) onStateChange("error");
        },
      });
      unsubscribeLifecycle = runtime.subscribeLifecycle(({ state }) => {
        if (disposed) return;
        if (state === "reconnecting") onStateChange("reconnecting");
        if (state === "failed") onStateChange("error");
      });
      unsubscribePresence = runtime.subscribePresence(({ participants }) => {
        if (disposed) return;
        onPresenceChange(
          participants.filter(({ status }) => status !== "disconnected").length,
        );
      });
      await runtime.start();
      await runtime.whenPresented();
      if (!disposed) onStateChange("ready");
    })().catch(() => {
      if (!disposed) onStateChange("error");
    });

    return () => {
      disposed = true;
      unsubscribeLifecycle();
      unsubscribePresence();
      const activeRuntime = runtime;
      runtime = undefined;
      if (activeRuntime) {
        void activeRuntime
          .stopGracefully(500)
          .catch(() => activeRuntime.stop());
      }
    };
  }, [onPresenceChange, onStateChange, reducedMotion, teamID]);

  return (
    <div
      ref={mountRef}
      className="team-lounge-v2__stage"
      aria-label="Interactive shared lounge canvas"
      tabIndex={0}
    />
  );
}
