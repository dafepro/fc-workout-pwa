"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type RefObject,
} from "react";
import type {
  CanvasConsumerError,
  CanvasRuntime,
  OverlayEntityProjection,
  OverlayProjectionSnapshot,
  ParticipantPresence,
  RuntimeDiagnostics,
} from "@canvas-physics/client";
import { DurableCommandKind } from "@canvas-physics/protocol";
import type { StampAsset } from "../team-canvas/model";
import {
  prepareTeamLoungeJoin,
  requestTeamLoungeAccess,
  type LoungePlaceableProp,
  type LoungePlaceableStamp,
  type LoungeTheme,
} from "./data/lounge-gateway";
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
  loungePlaceableAsset,
  placeableDefinitionID,
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
const postDragRejectionGraceMs = 2_000;
const deleteRejectionConfirmationMs = 1_500;

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
  stampEditingEnabled = true,
  onStampEditStart,
  onPlacementSummaryChange,
  onPlacementError,
  onPlacementPendingChange,
  onPlaceableStampsChange,
  onPlaceablePropsChange,
  onThemeChange,
  stampTrashTargetRef,
  onStampDragStateChange,
  onStampDeleteError,
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
  onStampEditStart?(): void;
  onPlacementSummaryChange?(summary: LoungePlacementSummary): void;
  onPlacementError?(reason: string): void;
  onPlacementPendingChange?(pending: boolean): void;
  onPlaceableStampsChange?(stamps: LoungePlaceableStamp[]): void;
  onPlaceablePropsChange?(props: LoungePlaceableProp[]): void;
  onThemeChange?(theme: LoungeTheme): void;
  stampTrashTargetRef?: RefObject<HTMLElement | null>;
  onStampDragStateChange?(
    state: {
      entityID: string;
      overTrash: boolean;
    } | null,
  ): void;
  onStampDeleteError?(reason: string): void;
}) {
  const mountRef = useRef<HTMLDivElement>(null);
  const runtimeRef = useRef<CanvasRuntime | null>(null);
  const rosterRef = useRef(roster);
  const onPlacementSummaryChangeRef = useRef(onPlacementSummaryChange);
  const onPlacementErrorRef = useRef(onPlacementError);
  const onPlacementPendingChangeRef = useRef(onPlacementPendingChange);
  const onPlaceableStampsChangeRef = useRef(onPlaceableStampsChange);
  const onPlaceablePropsChangeRef = useRef(onPlaceablePropsChange);
  const onThemeChangeRef = useRef(onThemeChange);
  const onStampDragStateChangeRef = useRef(onStampDragStateChange);
  const onStampDeleteErrorRef = useRef(onStampDeleteError);
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
  const [deletingStampID, setDeletingStampID] = useState<string | null>(null);
  const [draggedEditEntityID, setDraggedEditEntityID] = useState<string | null>(
    null,
  );
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
    onPlaceableStampsChangeRef.current = onPlaceableStampsChange;
  }, [onPlaceableStampsChange]);

  useEffect(() => {
    onPlaceablePropsChangeRef.current = onPlaceablePropsChange;
  }, [onPlaceablePropsChange]);

  useEffect(() => {
    onThemeChangeRef.current = onThemeChange;
  }, [onThemeChange]);

  useEffect(() => {
    onStampDragStateChangeRef.current = onStampDragStateChange;
  }, [onStampDragStateChange]);

  useEffect(() => {
    onStampDeleteErrorRef.current = onStampDeleteError;
  }, [onStampDeleteError]);

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
    let activeRoomID = "";
    let presented = false;
    let lastPlacementSummary = "";
    let avatarPointerRestoreTimer: number | undefined;
    let draggedStampID: string | null = null;
    let dragOverTrash = false;
    let ignoreInvalidPlacementUntil = 0;
    let ignoreEditRejectionsUntil = 0;
    let deleteAttempt:
      | {
          entityID: string;
          rejectedReason: string | null;
          confirmationTimer: number | undefined;
        }
      | undefined;
    const extendDragRejectionGrace = () => {
      ignoreInvalidPlacementUntil = Date.now() + postDragRejectionGraceMs;
    };
    const isOverTrash = (event: PointerEvent) => {
      const target = stampTrashTargetRef?.current;
      if (!target) return false;
      const bounds = target.getBoundingClientRect();
      return (
        event.clientX >= bounds.left &&
        event.clientX <= bounds.right &&
        event.clientY >= bounds.top &&
        event.clientY <= bounds.bottom
      );
    };
    const publishStampDrag = (overTrash: boolean) => {
      if (!draggedStampID || dragOverTrash === overTrash) return;
      dragOverTrash = overTrash;
      onStampDragStateChangeRef.current?.({
        entityID: draggedStampID,
        overTrash,
      });
    };
    const clearStampDrag = () => {
      if (!draggedStampID) return;
      draggedStampID = null;
      dragOverTrash = false;
      if (!disposed) setDraggedEditEntityID(null);
      onStampDragStateChangeRef.current?.(null);
    };
    const clearDeleteAttempt = (succeeded = false) => {
      if (deleteAttempt?.confirmationTimer !== undefined) {
        window.clearTimeout(deleteAttempt.confirmationTimer);
      }
      deleteAttempt = undefined;
      if (!disposed) setDeletingStampID(null);
      if (succeeded) {
        ignoreEditRejectionsUntil = Date.now() + postDragRejectionGraceMs;
      }
    };
    const confirmRejectedDelete = () => {
      const attempt = deleteAttempt;
      if (!attempt?.rejectedReason) return;
      if (!projections.some(({ entityId }) => entityId === attempt.entityID)) {
        clearDeleteAttempt(true);
        return;
      }
      const reason = attempt.rejectedReason;
      clearDeleteAttempt();
      onStampDeleteErrorRef.current?.(reason);
    };
    const holdDeleteRejection = (reason: string) => {
      const attempt = deleteAttempt;
      if (!attempt) return;
      attempt.rejectedReason = reason;
      if (attempt.confirmationTimer !== undefined) {
        window.clearTimeout(attempt.confirmationTimer);
      }
      attempt.confirmationTimer = window.setTimeout(
        confirmRejectedDelete,
        deleteRejectionConfirmationMs,
      );
    };
    const trackStampDrag = (event: PointerEvent) => {
      if (!draggedStampID) return;
      extendDragRejectionGrace();
      publishStampDrag(isOverTrash(event));
    };
    const finishStampDrag = (event: PointerEvent) => {
      const entityID = draggedStampID;
      if (!entityID) return;
      extendDragRejectionGrace();
      const shouldDelete = isOverTrash(event);
      clearStampDrag();
      if (!shouldDelete || !runtime) return;
      clearDeleteAttempt();
      deleteAttempt = {
        entityID,
        rejectedReason: null,
        confirmationTimer: undefined,
      };
      setDeletingStampID(entityID);
      runtime.clearItemEditSelection();
      runtime.deleteItem(entityID);
      event.preventDefault();
      event.stopPropagation();
    };
    document.addEventListener("pointermove", trackStampDrag, true);
    document.addEventListener("pointerup", finishStampDrag, true);
    document.addEventListener("pointercancel", clearStampDrag, true);
    window.addEventListener("blur", clearStampDrag);
    const prioritizeCurrentAvatarPointer = (event: PointerEvent) => {
      if (
        !(event.target instanceof Element) ||
        !event.target.closest(
          ".team-lounge-v2__participant--current .team-lounge-v2__participant-avatar",
        )
      ) {
        return;
      }
      const activeRuntime = runtime;
      if (!activeRuntime) return;
      activeRuntime.setEditMode(false);
      if (avatarPointerRestoreTimer !== undefined) {
        window.clearTimeout(avatarPointerRestoreTimer);
      }
      avatarPointerRestoreTimer = window.setTimeout(() => {
        avatarPointerRestoreTimer = undefined;
        if (runtime === activeRuntime && stampEditingEnabledRef.current) {
          activeRuntime.setEditMode(true);
        }
      }, 0);
    };
    document.addEventListener(
      "pointerdown",
      prioritizeCurrentAvatarPointer,
      true,
    );
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
      const placeableProjections = projections.flatMap((projection) => {
        if (projection.kind !== "item") return [];
        const placeable = loungePlaceableAsset(projection.definitionId);
        return placeable ? [{ projection, ...placeable }] : [];
      });
      const nextStampOverlays = placeableProjections.flatMap(
        ({ projection, asset, category }) => {
          if (!projection.inViewport) return [];
          return [
            {
              entityID: projection.entityId,
              asset,
              category,
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
      const ownStampCount = placeableProjections.filter(
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
      activeRoomID = join.roomID;
      visitorIDs = join.visitorIDs;
      onPlaceableStampsChangeRef.current?.(join.placeableStamps);
      onPlaceablePropsChangeRef.current?.(join.placeableProps ?? []);
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
        onEditSelectionChange: ({ selectedEntityId, ghost }) => {
          if (disposed) return;
          setEditSelectionID(selectedEntityId ?? null);
          const nextDraggedStampID = ghost?.entityId ?? null;
          if (nextDraggedStampID && nextDraggedStampID !== draggedStampID) {
            extendDragRejectionGrace();
            draggedStampID = nextDraggedStampID;
            dragOverTrash = false;
            setDraggedEditEntityID(nextDraggedStampID);
            onStampDragStateChangeRef.current?.({
              entityID: nextDraggedStampID,
              overTrash: false,
            });
          }
        },
        onError: (error: CanvasConsumerError) => {
          if (disposed) return;
          if (error.code === "durable_command_rejected") {
            const rejectedEntityID =
              typeof error.details?.entityId === "string"
                ? error.details.entityId
                : null;
            const rejectedCommandKind = error.details?.commandKind;
            if (
              (error.message === "stamp_invalid_placement" ||
                error.message === "outside_canvas") &&
              Date.now() <= ignoreInvalidPlacementUntil
            ) {
              return;
            }
            if (
              deleteAttempt &&
              rejectedEntityID === deleteAttempt.entityID &&
              rejectedCommandKind === DurableCommandKind.DURABLE_DELETE_ITEM &&
              !placementPendingRef.current
            ) {
              holdDeleteRejection(error.message);
              return;
            }
            if (
              deleteAttempt &&
              rejectedEntityID === deleteAttempt.entityID &&
              (rejectedCommandKind === DurableCommandKind.DURABLE_MOVE_ITEM ||
                rejectedCommandKind ===
                  DurableCommandKind.DURABLE_ROTATE_ITEM ||
                rejectedCommandKind === DurableCommandKind.DURABLE_SCALE_ITEM)
            ) {
              return;
            }
            if (
              !placementPendingRef.current &&
              Date.now() <= ignoreEditRejectionsUntil
            ) {
              return;
            }
            updatePlacementPending(false);
            onPlacementErrorRef.current?.(error.message);
            if (error.message === "stamp_unavailable") {
              void requestTeamLoungeAccess(teamID)
                .then((access) => {
                  if (disposed) return;
                  if (access.roomID !== activeRoomID) {
                    onStateChange("error");
                    return;
                  }
                  placementCreditsRef.current = access.placementCredits;
                  placementDayRef.current = access.placementDay;
                  setPlacementPolicy({
                    credits: access.placementCredits,
                    day: access.placementDay,
                  });
                  onPlaceableStampsChangeRef.current?.(access.placeableStamps);
                  onPlaceablePropsChangeRef.current?.(
                    access.placeableProps ?? [],
                  );
                  publishOverlays();
                })
                .catch(() => {
                  if (!disposed) {
                    onPlacementErrorRef.current?.(
                      "stamp_inventory_unavailable",
                    );
                  }
                });
            }
            return;
          }
          onStateChange("error");
        },
      });
      runtimeRef.current = runtime;
      unsubscribeLifecycle = runtime.subscribeLifecycle(({ state }) => {
        if (disposed) return;
        if (state === "reconnecting") {
          clearStampDrag();
          updatePlacementPending(false);
          onStateChange("reconnecting");
        }
        if (state === "failed") {
          clearStampDrag();
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
          if (
            deleteAttempt &&
            !projections.some(
              ({ entityId }) => entityId === deleteAttempt?.entityID,
            )
          ) {
            clearDeleteAttempt(true);
          }
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
      document.removeEventListener(
        "pointerdown",
        prioritizeCurrentAvatarPointer,
        true,
      );
      document.removeEventListener("pointermove", trackStampDrag, true);
      document.removeEventListener("pointerup", finishStampDrag, true);
      document.removeEventListener("pointercancel", clearStampDrag, true);
      window.removeEventListener("blur", clearStampDrag);
      clearStampDrag();
      clearDeleteAttempt();
      if (avatarPointerRestoreTimer !== undefined) {
        window.clearTimeout(avatarPointerRestoreTimer);
      }
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
    stampTrashTargetRef,
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
        stamps={stampOverlays.filter(
          ({ entityID }) => entityID !== deletingStampID,
        )}
        selectedStamp={remainingPlacements > 0 ? selectedStamp : null}
        placementPending={placementPending}
        currentPlayerID={playerID}
        editableEntityIDs={editableStampIDs}
        selectedEntityID={stampEditingEnabled ? editSelectionID : null}
        draggingEntityID={draggedEditEntityID}
        onSelect={(entityID) => {
          const runtime = runtimeRef.current;
          if (!runtime) return;
          onStampEditStart?.();
          setEditSelectionID(entityID);
          runtime.setEditMode(true);
          if (runtime.selectItemForEdit(entityID)) return;
          window.requestAnimationFrame(() => {
            if (!runtime.selectItemForEdit(entityID)) {
              setEditSelectionID((selected) =>
                selected === entityID ? null : selected,
              );
            }
          });
        }}
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
          runtime.spawnItem(placeableDefinitionID(selectedStamp.id), position);
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
