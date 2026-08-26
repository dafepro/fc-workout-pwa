"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type {
  CanvasConsumerError,
  CanvasRuntime,
  OverlayEntityProjection,
  OverlayProjectionSnapshot,
  ParticipantPresence,
  RuntimeDiagnostics,
} from "@canvas-physics/client";
import type { StampAsset } from "../team-canvas/model";
import { prepareTeamLoungeJoin, type LoungeTheme } from "./data/lounge-gateway";
import type { LocalLoungeCanvasState } from "./LocalLoungeCanvas";
import { AvatarOverlays } from "./overlays/AvatarOverlays";
import {
  StampOverlays,
  type LoungeStampOverlay,
} from "./overlays/StampOverlays";
import { VisitTraces } from "./overlays/VisitTraces";
import {
  mergeLoungePresence,
  type LoungeParticipantOverlay,
  type LoungeRosterMember,
} from "./presence";
import {
  ignoreLoungePointerTarget,
  sharedLoungePointerOptions,
  sharedLoungeRates,
} from "./runtime-config";
import { beachBoardwalkAssets } from "./scene/assets";
import { beachBoardwalkDefinitions } from "./scene/beach-boardwalk";
import {
  loungeStampAsset,
  stampAssetIDFromDefinition,
  stampDefinitionID,
} from "./placement/catalog";
import { loungeWorldPoint } from "./placement/coordinates";
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

export interface LoungePlacementSummary {
  earned: number;
  used: number;
  remaining: number;
}

export function SharedLoungeCanvas({
  teamID,
  playerID,
  roster,
  onStateChange,
  onPresenceChange,
  onSignalPortChange,
  onDiagnostics,
  selectedStamp = null,
  stampEditingEnabled = false,
  onPlacementSummaryChange,
  onPlacementError,
  onPlacementPendingChange,
  onThemeChange,
}: {
  teamID: string;
  playerID: string;
  roster: readonly LoungeRosterMember[];
  onStateChange(state: LocalLoungeCanvasState): void;
  onPresenceChange(count: number): void;
  onSignalPortChange(sender: ((kind: string) => void) | null): void;
  onDiagnostics?(diagnostics: RuntimeDiagnostics): void;
  selectedStamp?: StampAsset | null;
  stampEditingEnabled?: boolean;
  onPlacementSummaryChange?(summary: LoungePlacementSummary): void;
  onPlacementError?(reason: string): void;
  onPlacementPendingChange?(pending: boolean): void;
  onThemeChange?(theme: LoungeTheme): void;
}) {
  const mountRef = useRef<HTMLDivElement>(null);
  const runtimeRef = useRef<CanvasRuntime | null>(null);
  const rosterRef = useRef(roster);
  const onPlacementSummaryChangeRef = useRef(onPlacementSummaryChange);
  const onPlacementErrorRef = useRef(onPlacementError);
  const onPlacementPendingChangeRef = useRef(onPlacementPendingChange);
  const onThemeChangeRef = useRef(onThemeChange);
  const placementCreditsRef = useRef(0);
  const placementDayRef = useRef("");
  const projectionFrameRef = useRef<
    Pick<OverlayProjectionSnapshot, "canvasSize" | "viewport"> | undefined
  >(undefined);
  const ownStampCountRef = useRef(0);
  const placementPendingRef = useRef(false);
  const stampEditingEnabledRef = useRef(stampEditingEnabled);
  const [overlays, setOverlays] = useState<LoungeParticipantOverlay[]>([]);
  const [stampOverlays, setStampOverlays] = useState<LoungeStampOverlay[]>([]);
  const [placementPolicy, setPlacementPolicy] = useState({
    credits: 0,
    day: "",
  });
  const [usedPlacements, setUsedPlacements] = useState(0);
  const [editSelectionID, setEditSelectionID] = useState<string | null>(null);
  const [placementPending, setPlacementPending] = useState(false);
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
    onPlacementSummaryChangeRef.current = onPlacementSummaryChange;
  }, [onPlacementSummaryChange]);

  useEffect(() => {
    onPlacementErrorRef.current = onPlacementError;
  }, [onPlacementError]);

  useEffect(() => {
    onPlacementPendingChangeRef.current = onPlacementPendingChange;
  }, [onPlacementPendingChange]);

  useEffect(() => {
    onThemeChangeRef.current = onThemeChange;
  }, [onThemeChange]);

  useEffect(() => {
    stampEditingEnabledRef.current = stampEditingEnabled;
    runtimeRef.current?.setEditMode(stampEditingEnabled);
  }, [stampEditingEnabled]);

  const updatePlacementPending = useCallback((pending: boolean) => {
    placementPendingRef.current = pending;
    setPlacementPending(pending);
    onPlacementPendingChangeRef.current?.(pending);
  }, []);

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
    let presented = false;
    let lastPlacementSummary = "";
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
      const stampProjections = projections.flatMap((projection) => {
        if (projection.kind !== "item") return [];
        const assetID = stampAssetIDFromDefinition(projection.definitionId);
        const asset = assetID ? loungeStampAsset(assetID) : undefined;
        if (!asset) return [];
        return [{ projection, asset }];
      });
      const nextStampOverlays = stampProjections.flatMap(
        ({ projection, asset }) => {
          if (!projection.inViewport) return [];
          return [
            {
              entityID: projection.entityId,
              asset,
              ownerUserID: projectionOwnerUserID(projection),
              rotation: projection.rotation,
              scale: projection.scale,
              screen: projection.screen,
              world: projection.world ?? null,
              placementDay: placementDayFromConfig(projection.resolvedConfig),
            },
          ];
        },
      );
      setStampOverlays(nextStampOverlays);
      const ownStampCount = stampProjections.filter(
        ({ projection }) => projectionOwnerUserID(projection) === playerID,
      ).length;
      if (
        ownStampCount > ownStampCountRef.current &&
        placementPendingRef.current
      ) {
        updatePlacementPending(false);
      }
      ownStampCountRef.current = ownStampCount;
      setUsedPlacements(ownStampCount);
      const summary = {
        earned: placementCreditsRef.current,
        used: ownStampCount,
        remaining: Math.max(0, placementCreditsRef.current - ownStampCount),
      };
      const summaryKey = `${summary.earned}:${summary.used}:${summary.remaining}`;
      if (summaryKey !== lastPlacementSummary) {
        lastPlacementSummary = summaryKey;
        onPlacementSummaryChangeRef.current?.(summary);
      }
      const activePlayerIDs = participants
        .filter(({ status }) => status === "active")
        .map(({ participantId }) => participantId);
      const anchors = presented
        ? visitTraceWorldAnchors.flatMap((anchor) => {
            const projection = runtime?.projectWorldPoint(anchor);
            return projection?.inViewport ? [projection.screen] : [];
          })
        : [];
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
      if (disposed) return;
      visitorIDs = join.visitorIDs;
      onThemeChangeRef.current?.(join.theme);
      placementCreditsRef.current = join.placementCredits;
      placementDayRef.current = join.placementDay;
      setPlacementPolicy({
        credits: join.placementCredits,
        day: join.placementDay,
      });
      const { CanvasRuntime: Runtime } = await import("@canvas-physics/client");
      if (disposed) return;
      runtime = new Runtime({
        roomId: join.roomID,
        serverUrl: join.serverURL,
        credentialProvider: join.credentialProvider,
        mount,
        pointerElement: mount.parentElement ?? mount,
        ignorePointerTarget: ignoreLoungePointerTarget,
        definitions: beachBoardwalkDefinitions,
        assets: beachBoardwalkAssets,
        scene: {
          background: 0x63c9dc,
          resolution: Math.min(devicePixelRatio, 2),
          touchAction: "pan-y",
        },
        rates: sharedLoungeRates,
        pointer: sharedLoungePointerOptions(),
        hideDisabledAvatars: true,
        onDiagnostics,
        onEditSelectionChange: ({ selectedEntityId }) => {
          if (!disposed) setEditSelectionID(selectedEntityId ?? null);
        },
        onError: (error: CanvasConsumerError) => {
          if (disposed) return;
          if (error.code === "durable_command_rejected") {
            updatePlacementPending(false);
            onPlacementErrorRef.current?.(error.message);
            return;
          }
          onStateChange("error");
        },
      });
      runtimeRef.current = runtime;
      unsubscribeLifecycle = runtime.subscribeLifecycle(({ state }) => {
        if (disposed) return;
        if (state === "reconnecting") {
          updatePlacementPending(false);
          onStateChange("reconnecting");
        }
        if (state === "failed") {
          updatePlacementPending(false);
          onStateChange("error");
        }
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
          projectionFrameRef.current = {
            canvasSize: snapshot.canvasSize,
            viewport: snapshot.viewport,
          };
          projections = snapshot.entities;
          publishOverlays();
        },
        { kinds: ["avatar", "item"], maxEntities: 200, maxHz: 60 },
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
        presented = true;
        runtime.setEditMode(stampEditingEnabledRef.current);
        publishOverlays();
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
      placementPendingRef.current = false;
      onPlacementPendingChangeRef.current?.(false);
      for (const timer of emoteTimers.values()) {
        window.clearTimeout(timer);
      }
      emoteTimers.clear();
      const activeRuntime = runtime;
      runtime = undefined;
      runtimeRef.current = null;
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
    updatePlacementPending,
  ]);

  const editableStampIDs = stampEditingEnabled
    ? stampOverlays
        .filter(
          ({ ownerUserID, placementDay }) =>
            ownerUserID === playerID && placementDay === placementPolicy.day,
        )
        .map(({ entityID }) => entityID)
    : [];
  const remainingPlacements = Math.max(
    0,
    placementPolicy.credits - usedPlacements,
  );

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
      <StampOverlays
        stamps={stampOverlays}
        selectedStamp={remainingPlacements > 0 ? selectedStamp : null}
        placementPending={placementPending}
        currentPlayerID={playerID}
        editableEntityIDs={editableStampIDs}
        selectedEntityID={stampEditingEnabled ? editSelectionID : null}
        onSelect={(entityID) => runtimeRef.current?.selectItemForEdit(entityID)}
        onScale={(entityID, scale, preview) => {
          const stamp = stampOverlays.find(
            (candidate) => candidate.entityID === entityID,
          );
          if (!stamp?.world) return;
          if (preview) {
            runtimeRef.current?.transformItem(
              entityID,
              {
                ...stamp.world,
                rotation: stamp.rotation,
                scale,
              },
              true,
            );
          } else {
            runtimeRef.current?.scaleItem(entityID, scale);
          }
          setStampOverlays((current) =>
            current.map((stamp) =>
              stamp.entityID === entityID ? { ...stamp, scale } : stamp,
            ),
          );
        }}
        onRotate={(entityID, rotation, preview) => {
          const stamp = stampOverlays.find(
            (candidate) => candidate.entityID === entityID,
          );
          if (!stamp?.world) return;
          if (preview) {
            runtimeRef.current?.transformItem(
              entityID,
              {
                ...stamp.world,
                rotation,
                scale: stamp.scale,
              },
              true,
            );
          } else {
            runtimeRef.current?.rotateItem(entityID, rotation);
          }
          setStampOverlays((current) =>
            current.map((stamp) =>
              stamp.entityID === entityID ? { ...stamp, rotation } : stamp,
            ),
          );
        }}
        onDone={() => runtimeRef.current?.clearItemEditSelection()}
        onPlace={(screen) => {
          if (
            !selectedStamp ||
            remainingPlacements <= 0 ||
            placementPendingRef.current
          ) {
            return;
          }
          const runtime = runtimeRef.current;
          const frame = projectionFrameRef.current;
          if (!runtime || !frame) return;
          const position = loungeWorldPoint(
            screen,
            frame.viewport,
            frame.canvasSize,
          );
          if (!position) {
            onPlacementErrorRef.current?.("stamp_invalid_placement");
            return;
          }
          updatePlacementPending(true);
          runtime.spawnItem(stampDefinitionID(selectedStamp.id), position);
        }}
      />
      <p className="sr-only" role="status" aria-live="polite">
        {announcement}
      </p>
    </>
  );
}

function placementDayFromConfig(config: unknown): string | null {
  if (!config || typeof config !== "object" || Array.isArray(config))
    return null;
  const placementDay = (config as Record<string, unknown>).placementDay;
  return typeof placementDay === "string" &&
    /^\d{4}-\d{2}-\d{2}$/u.test(placementDay)
    ? placementDay
    : null;
}

function projectionOwnerUserID(
  projection: OverlayEntityProjection,
): string | null {
  return (
    (projection as OverlayEntityProjection & { ownerUserId?: string })
      .ownerUserId ?? null
  );
}
