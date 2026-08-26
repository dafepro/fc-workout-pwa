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
import { VisitTraces } from "./overlays/VisitTraces";
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
import {
  LOUNGE_EMOTE_DURATION_MS,
  loungeEmoteForSignal,
  type LoungeEmote,
} from "./social/emotes";
import {
  mergeLoungeVisitTraces,
  type LoungeVisitTraceOverlay,
} from "./visit-traces";

const visitTraceWorldAnchors = [
  { x: 8, y: 74 },
  { x: 74, y: 81 },
  { x: 48, y: 125 },
] as const;

export function SharedLoungeCanvas({
  teamID,
  playerID,
  roster,
  onStateChange,
  onPresenceChange,
  onSignalPortChange,
  onDiagnostics,
}: {
  teamID: string;
  playerID: string;
  roster: readonly LoungeRosterMember[];
  onStateChange(state: LocalLoungeCanvasState): void;
  onPresenceChange(count: number): void;
  onSignalPortChange(sender: ((kind: string) => void) | null): void;
  onDiagnostics?(diagnostics: RuntimeDiagnostics): void;
}) {
  const mountRef = useRef<HTMLDivElement>(null);
  const rosterRef = useRef(roster);
  const [overlays, setOverlays] = useState<LoungeParticipantOverlay[]>([]);
  const [visitTraces, setVisitTraces] = useState<LoungeVisitTraceOverlay[]>([]);
  const [participantEmotes, setParticipantEmotes] = useState<
    Record<string, LoungeEmote>
  >({});
  const [announcement, setAnnouncement] = useState("");
  const emoteTimersRef = useRef(new Map<string, number>());

  useEffect(() => {
    rosterRef.current = roster;
  }, [roster]);

  useEffect(() => {
    const mount = mountRef.current;
    if (!mount) return;
    const emoteTimers = emoteTimersRef.current;
    let disposed = false;
    let runtime: CanvasRuntime | undefined;
    let unsubscribeLifecycle: () => void = () => undefined;
    let unsubscribePresence: () => void = () => undefined;
    let unsubscribeProjection: () => void = () => undefined;
    let unsubscribeSignals: () => void = () => undefined;
    let participants: readonly ParticipantPresence[] = [];
    let projections: readonly OverlayEntityProjection[] = [];
    let visitorIDs: readonly string[] = [];
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
      const activePlayerIDs = participants
        .filter(({ status }) => status === "active")
        .map(({ participantId }) => participantId);
      const anchors = visitTraceWorldAnchors.flatMap((anchor) => {
        const projection = runtime?.projectWorldPoint(anchor);
        return projection?.inViewport ? [projection.screen] : [];
      });
      setVisitTraces(
        mergeLoungeVisitTraces({
          currentPlayerID: playerID,
          visitorIDs,
          activePlayerIDs,
          roster: rosterRef.current,
          anchors,
        }),
      );
    };
    onStateChange("loading");

    void (async () => {
      const join = await prepareTeamLoungeJoin(teamID);
      visitorIDs = join.visitorIDs;
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
      unsubscribeSignals = runtime.subscribeParticipantSignals((signal) => {
        const emote = loungeEmoteForSignal(signal.kind);
        const member = rosterRef.current.find(
          ({ playerID: rosterPlayerID }) =>
            rosterPlayerID === signal.participantId,
        );
        if (!emote || !member || disposed) return;
        const currentTimer = emoteTimers.get(signal.participantId);
        if (currentTimer !== undefined) window.clearTimeout(currentTimer);
        setParticipantEmotes((current) => ({
          ...current,
          [signal.participantId]: emote,
        }));
        setAnnouncement(
          signal.participantId === playerID
            ? `You sent a ${emote.label}`
            : `${member.displayName} sent a ${emote.label}`,
        );
        const timer = window.setTimeout(() => {
          emoteTimers.delete(signal.participantId);
          setParticipantEmotes((current) => {
            const next = { ...current };
            delete next[signal.participantId];
            return next;
          });
        }, LOUNGE_EMOTE_DURATION_MS);
        emoteTimers.set(signal.participantId, timer);
      });
      await runtime.start();
      await runtime.whenPresented();
      if (!disposed) {
        onSignalPortChange((kind) => runtime?.sendParticipantSignal(kind));
        onStateChange("ready");
      }
    })().catch(() => {
      if (!disposed) onStateChange("error");
    });

    return () => {
      disposed = true;
      unsubscribeLifecycle();
      unsubscribePresence();
      unsubscribeProjection();
      unsubscribeSignals();
      onSignalPortChange(null);
      for (const timer of emoteTimers.values()) {
        window.clearTimeout(timer);
      }
      emoteTimers.clear();
      const activeRuntime = runtime;
      runtime = undefined;
      if (activeRuntime) {
        void activeRuntime
          .stopGracefully(500)
          .catch(() => activeRuntime.stop());
      }
    };
  }, [
    onDiagnostics,
    onPresenceChange,
    onSignalPortChange,
    onStateChange,
    playerID,
    teamID,
  ]);

  return (
    <>
      <div
        ref={mountRef}
        className="team-lounge-v2__stage"
        aria-label="Interactive shared lounge canvas"
        tabIndex={0}
      />
      <VisitTraces traces={visitTraces} />
      <AvatarOverlays participants={overlays} emotes={participantEmotes} />
      <p className="sr-only" role="status" aria-live="polite">
        {announcement}
      </p>
    </>
  );
}
