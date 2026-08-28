"use client";

import { useEffect, useRef, useState } from "react";
import type {
  CanvasRuntime,
  OverlayEntityProjection,
  ParticipantPresence,
} from "@canvas-physics/client";

import { PlayerAvatar } from "../components/PlayerAvatar";
import type { Player } from "../domain/types";
import type { LoungeCanvasState } from "./LocalLoungeCanvas";
import { loungeBallEntityID, publishLoungeBallPosition } from "./ball-position";
import { prepareTeamLoungeJoin } from "./lounge-gateway";
import { beachBoardwalkAssets } from "./scene/assets";
import { beachBoardwalkDefinitions } from "./scene/beach-boardwalk";

interface AvatarOverlay {
  player: Player;
  position: { x: number; y: number };
  current: boolean;
}

export function SharedLoungeCanvas({
  teamID,
  playerID,
  roster,
  onStateChange,
  onPresenceChange,
}: {
  teamID: string;
  playerID: string;
  roster: readonly Player[];
  onStateChange(state: LoungeCanvasState): void;
  onPresenceChange(count: number): void;
}) {
  const mountRef = useRef<HTMLDivElement>(null);
  const rosterRef = useRef(roster);
  const [overlays, setOverlays] = useState<AvatarOverlay[]>([]);

  useEffect(() => {
    rosterRef.current = roster;
  }, [roster]);

  useEffect(() => {
    const mount = mountRef.current;
    if (!mount) return;
    let disposed = false;
    let runtime: CanvasRuntime | undefined;
    let participants: readonly ParticipantPresence[] = [];
    let projections: readonly OverlayEntityProjection[] = [];
    let unsubscribePresence: () => void = () => undefined;
    let unsubscribeProjection: () => void = () => undefined;
    let unsubscribeLifecycle: () => void = () => undefined;

    const publishOverlays = () => {
      if (disposed) return;
      const localParticipant = participants.find(
        ({ userId }) => userId === playerID,
      );
      const localProjection = projections.find(
        ({ entityId }) => entityId === localParticipant?.avatarEntityId,
      );
      if (localProjection) {
        mount.dataset.playerX = localProjection.world.x.toFixed(3);
        mount.dataset.playerY = localProjection.world.y.toFixed(3);
      } else {
        delete mount.dataset.playerX;
        delete mount.dataset.playerY;
      }
      setOverlays(
        participants.flatMap((participant) => {
          if (participant.status === "disconnected") return [];
          const projection = projections.find(
            ({ entityId }) => entityId === participant.avatarEntityId,
          );
          const player = rosterRef.current.find(
            ({ id }) => id === participant.userId,
          );
          if (!projection?.inViewport || !player) return [];
          return [
            {
              player,
              position: projection.screen,
              current: participant.userId === playerID,
            },
          ];
        }),
      );
    };

    onStateChange("loading");
    void (async () => {
      const join = await prepareTeamLoungeJoin(teamID);
      if (disposed) return;
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
        spawnPointId: "arrival",
        pointer: {
          mode: "avatarDrag",
          deadZonePx: 2,
          grabRadiusPx: 36,
          flick: false,
        },
        hideDisabledAvatars: true,
        onError: () => !disposed && onStateChange("error"),
      });
      unsubscribePresence = runtime.subscribePresence(
        ({ participants: nextParticipants }) => {
          participants = nextParticipants;
          onPresenceChange(
            participants.filter(({ status }) => status !== "disconnected")
              .length,
          );
          publishOverlays();
        },
      );
      unsubscribeProjection = runtime.subscribeOverlayProjection(
        ({ entities }) => {
          projections = entities;
          publishLoungeBallPosition(
            mount,
            entities.find(({ entityId }) => entityId === loungeBallEntityID)
              ?.world,
          );
          publishOverlays();
        },
        { kinds: ["avatar", "item"], maxEntities: 25, maxHz: 30 },
      );
      unsubscribeLifecycle = runtime.subscribeLifecycle(({ state }) => {
        if (state === "reconnecting") onStateChange("loading");
        if (state === "failed") onStateChange("error");
      });
      await runtime.start({ until: "presented" });
      if (!disposed) onStateChange("ready");
    })().catch(() => !disposed && onStateChange("error"));

    return () => {
      disposed = true;
      unsubscribePresence();
      unsubscribeProjection();
      unsubscribeLifecycle();
      const active = runtime;
      runtime = undefined;
      if (active) void active.stopGracefully(500).catch(() => active.stop());
    };
  }, [onPresenceChange, onStateChange, playerID, teamID]);

  return (
    <>
      <div
        ref={mountRef}
        className="team-lounge__stage"
        aria-label="Interactive lounge canvas"
        tabIndex={0}
      />
      {overlays.map(({ player, position, current }) => (
        <div
          className="team-lounge__shared-avatar"
          key={player.id}
          style={{
            transform: `translate3d(${position.x}px, ${position.y}px, 0)`,
          }}
        >
          <PlayerAvatar player={player} size="medium" />
          <span>{current ? "You" : player.firstName}</span>
        </div>
      ))}
    </>
  );
}
