"use client";

import { useEffect, useRef, useState } from "react";
import type {
  CanvasRuntime,
  OverlayEntityProjection,
  ParticipantPresence,
  RuntimeDiagnostics,
} from "@canvas-physics/client";
import { prepareTeamLoungeJoin } from "./data/lounge-gateway";
import type { LocalLoungeCanvasState } from "./LocalLoungeCanvas";
import { AvatarOverlays } from "./overlays/AvatarOverlays";
import {
  mergeLoungePresence,
  type LoungeParticipantOverlay,
  type LoungeRosterMember,
} from "./presence";
import {
  sharedLoungePointerOptions,
  sharedLoungeRates,
} from "./runtime-config";
import { beachBoardwalkAssets } from "./scene/assets";
import { beachBoardwalkDefinitions } from "./scene/beach-boardwalk";

export function SharedLoungeCanvas({
  teamID,
  playerID,
  roster,
  onStateChange,
  onPresenceChange,
  onDiagnostics,
}: {
  teamID: string;
  playerID: string;
  roster: readonly LoungeRosterMember[];
  onStateChange(state: LocalLoungeCanvasState): void;
  onPresenceChange(count: number): void;
  onDiagnostics?(diagnostics: RuntimeDiagnostics): void;
}) {
  const mountRef = useRef<HTMLDivElement>(null);
  const rosterRef = useRef(roster);
  const [overlays, setOverlays] = useState<LoungeParticipantOverlay[]>([]);

  useEffect(() => {
    rosterRef.current = roster;
  }, [roster]);

  useEffect(() => {
    const mount = mountRef.current;
    if (!mount) return;
    let disposed = false;
    let runtime: CanvasRuntime | undefined;
    let unsubscribeLifecycle: () => void = () => undefined;
    let unsubscribePresence: () => void = () => undefined;
    let unsubscribeProjection: () => void = () => undefined;
    let participants: readonly ParticipantPresence[] = [];
    let projections: readonly OverlayEntityProjection[] = [];
    const publishOverlays = () => {
      if (disposed) return;
      setOverlays(
        mergeLoungePresence({
          currentPlayerID: playerID,
          roster: rosterRef.current,
          participants,
          projections,
        }),
      );
    };
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
        rates: sharedLoungeRates,
        pointer: sharedLoungePointerOptions(),
        hideDisabledAvatars: true,
        onDiagnostics,
        onError: () => {
          if (!disposed) onStateChange("error");
        },
      });
      unsubscribeLifecycle = runtime.subscribeLifecycle(({ state }) => {
        if (disposed) return;
        if (state === "reconnecting") onStateChange("reconnecting");
        if (state === "failed") onStateChange("error");
      });
      unsubscribePresence = runtime.subscribePresence(
        ({ participants: nextParticipants }) => {
          if (disposed) return;
          participants = nextParticipants;
          onPresenceChange(
            participants.filter(({ status }) => status !== "disconnected")
              .length,
          );
          publishOverlays();
        },
      );
      unsubscribeProjection = runtime.subscribeOverlayProjection(
        (snapshot) => {
          projections = snapshot.entities;
          publishOverlays();
        },
        { kinds: ["avatar"], maxEntities: 24, maxHz: 60 },
      );
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
      unsubscribeProjection();
      const activeRuntime = runtime;
      runtime = undefined;
      if (activeRuntime) {
        void activeRuntime
          .stopGracefully(500)
          .catch(() => activeRuntime.stop());
      }
    };
  }, [onDiagnostics, onPresenceChange, onStateChange, playerID, teamID]);

  return (
    <>
      <div
        ref={mountRef}
        className="team-lounge-v2__stage"
        aria-label="Interactive shared lounge canvas"
        tabIndex={0}
      />
      <AvatarOverlays participants={overlays} />
    </>
  );
}
