"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type {
  CanvasConsumerError,
  CanvasRuntime,
  OverlayEntityProjection,
  ParticipantPresence,
  RuntimeDiagnostics,
} from "@canvas-physics/client";
import type { StampAsset } from "../team-canvas/model";
import { prepareTeamLoungeJoin } from "./data/lounge-gateway";
import type { LocalLoungeCanvasState } from "./LocalLoungeCanvas";
import { AvatarOverlays } from "./overlays/AvatarOverlays";
import {
  StampOverlays,
  type LoungeStampOverlay,
  type LoungeStampSpotOverlay,
} from "./overlays/StampOverlays";
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
  loungeStampAsset,
  stampAssetIDFromDefinition,
  stampDefinitionID,
} from "./placement/catalog";
import { loungeStampZones, type LoungeStampZone } from "./placement/zones";
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
  selectedStamp = null,
  stampEditingEnabled = false,
  onPlacementChange,
  onPlacementError,
  onPlacementPendingChange,
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
  onPlacementChange?(assetID: string | null): void;
  onPlacementError?(reason: string): void;
  onPlacementPendingChange?(pending: boolean): void;
}) {
  const mountRef = useRef<HTMLDivElement>(null);
  const runtimeRef = useRef<CanvasRuntime | null>(null);
  const rosterRef = useRef(roster);
  const onPlacementChangeRef = useRef(onPlacementChange);
  const onPlacementErrorRef = useRef(onPlacementError);
  const onPlacementPendingChangeRef = useRef(onPlacementPendingChange);
  const placedAssetIDRef = useRef<string | null>(null);
  const placementPendingRef = useRef(false);
  const stampEditingEnabledRef = useRef(stampEditingEnabled);
  const [overlays, setOverlays] = useState<LoungeParticipantOverlay[]>([]);
  const [stampOverlays, setStampOverlays] = useState<LoungeStampOverlay[]>([]);
  const [stampSpots, setStampSpots] = useState<LoungeStampSpotOverlay[]>([]);
  const [ownStampID, setOwnStampID] = useState<string | null>(null);
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
    onPlacementChangeRef.current = onPlacementChange;
  }, [onPlacementChange]);

  useEffect(() => {
    onPlacementErrorRef.current = onPlacementError;
  }, [onPlacementError]);

  useEffect(() => {
    onPlacementPendingChangeRef.current = onPlacementPendingChange;
  }, [onPlacementPendingChange]);

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
      const nextStampOverlays = projections.flatMap((projection) => {
        if (projection.kind !== "item" || !projection.inViewport) return [];
        const assetID = stampAssetIDFromDefinition(projection.definitionId);
        const asset = assetID ? loungeStampAsset(assetID) : undefined;
        if (!asset) return [];
        return [
          {
            entityID: projection.entityId,
            asset,
            ownerUserID:
              (
                projection as OverlayEntityProjection & {
                  ownerUserId?: string;
                }
              ).ownerUserId ?? null,
            scale: projection.scale,
            screen: projection.screen,
          },
        ];
      });
      setStampOverlays(nextStampOverlays);
      const ownAssetID =
        nextStampOverlays.find(({ ownerUserID }) => ownerUserID === playerID)
          ?.asset.id ?? null;
      if (ownAssetID !== placedAssetIDRef.current) {
        placedAssetIDRef.current = ownAssetID;
        setOwnStampID(ownAssetID);
        onPlacementChangeRef.current?.(ownAssetID);
      }
      if (ownAssetID && placementPendingRef.current) {
        updatePlacementPending(false);
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
      setStampSpots(
        presented
          ? loungeStampZones.flatMap((zone) => {
              const projection = runtime?.projectWorldPoint(zone.position);
              return projection?.inViewport
                ? [{ zone, screen: projection.screen }]
                : [];
            })
          : [],
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
        pointerElement: mount.parentElement ?? mount,
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
          projections = snapshot.entities;
          publishOverlays();
        },
        { kinds: ["avatar", "item"], maxEntities: 72, maxHz: 60 },
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

  const editableStamp = stampEditingEnabled
    ? stampOverlays.find(({ ownerUserID }) => ownerUserID === playerID)
    : undefined;

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
        spots={ownStampID ? [] : stampSpots}
        selectedStamp={ownStampID ? null : selectedStamp}
        placementPending={placementPending}
        editableEntityID={editableStamp?.entityID}
        selectedEntityID={stampEditingEnabled ? editSelectionID : null}
        onSelect={(entityID) => runtimeRef.current?.selectItemForEdit(entityID)}
        onScale={(entityID, scale) => {
          runtimeRef.current?.scaleItem(entityID, scale);
          setStampOverlays((current) =>
            current.map((stamp) =>
              stamp.entityID === entityID ? { ...stamp, scale } : stamp,
            ),
          );
        }}
        onDone={() => runtimeRef.current?.clearItemEditSelection()}
        onPlace={(zone: LoungeStampZone) => {
          if (
            !selectedStamp ||
            placedAssetIDRef.current ||
            placementPendingRef.current
          ) {
            return;
          }
          const runtime = runtimeRef.current;
          if (!runtime) return;
          updatePlacementPending(true);
          runtime.spawnItem(stampDefinitionID(selectedStamp.id), zone.position);
        }}
      />
      <p className="sr-only" role="status" aria-live="polite">
        {announcement}
      </p>
    </>
  );
}
