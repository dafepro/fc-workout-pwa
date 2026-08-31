"use client";

import {
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type MouseEvent,
} from "react";
import type {
  CanvasRuntime,
  AssetManifest,
  OverlayEntityProjection,
  OverlayProjectionSnapshot,
  ParticipantPresence,
  RenderEntity,
} from "@canvas-physics/client";
import { TransientActionRejectCode } from "@canvas-physics/protocol";

import { PlayerAvatar } from "../components/PlayerAvatar";
import { AvatarArt } from "../avatar/AvatarArt";
import { normalizeAvatar } from "../avatar/config";
import { copy } from "../content/copy";
import { createConnectedPrizeBoxGateway } from "../data/prize-box-gateway";
import type { Player } from "../domain/types";
import { useAvatarIdentity } from "../state/avatar-identity-context";
import type { LoungeCanvasState } from "./LocalLoungeCanvas";
import { LoungeActionDock } from "./LoungeActionDock";
import { LoungeItemEditor, type LoungeEditableItem } from "./LoungeItemEditor";
import { LoungeItemArt } from "./LoungeItemArt";
import { loungeBallEntityID, publishLoungeBallPosition } from "./ball-position";
import { loungeWorldPoint } from "./lounge-editor-geometry";
import {
  LOUNGE_REACTION_DURATION_MS,
  loungeEmotes,
  type LoungeEmote,
} from "./lounge-emotes";
import {
  loungeQuickPhrases,
  type LoungeQuickPhrase,
} from "./lounge-quick-phrases";
import { performLoungeItemMutation } from "./lounge-item-mutations";
import {
  includedLoungeItems,
  loungeItemChoices,
  loungeItemDefinitions,
  loungeItemForDefinition,
  type LoungeItemChoice,
} from "./lounge-items";
import {
  resolveLoungeAvatarOverlays,
  type LoungeAvatarOverlay,
} from "./lounge-presence";
import {
  clearPendingTeamLoungePlacement,
  prepareTeamLoungeJoin,
  recoverPendingTeamLoungePlacement,
  rememberPendingTeamLoungePlacement,
  requestTeamLoungeItemMutationPermit,
  reserveTeamLoungePlacement,
  TeamLoungeItemRevisionError,
  type TeamLoungeItemMutationKind,
  type TeamLoungeItemTransform,
} from "./lounge-gateway";
import {
  preserveNativeCanvasScroll,
  relayAvatarPointerDown,
} from "./native-canvas-scroll";
import { beachBoardwalkAssets } from "./scene/assets";
import {
  beachBoardwalkCanvas,
  beachBoardwalkDefinitions,
} from "./scene/beach-boardwalk";
import { createLoungePixiPresentation } from "./scene/pixi-presentation";

const visitorAnchors = [
  { x: 8, y: 74 },
  { x: 74, y: 81 },
  { x: 48, y: 125 },
] as const;

const MINI_GOAL_DEFINITION_ID = "zoomigo-prop-play-mini-goal";
const GOAL_CELEBRATION_DURATION_MS = 2_800;
const GOAL_CONFETTI_PARTICLE_COUNT = 100;
const GOAL_CONFETTI_COLORS = ["#ffdc3f", "#22d3a8", "#ff617c", "#7dd3fc"];
const LOUNGE_AVATAR_DIAMETER_WORLD = 18;
const LOUNGE_BENCH_AVATAR_DIAMETER_WORLD = 12;
const LOUNGE_BENCH_ANCHORS = [
  { x: 16, y: 106 },
  { x: 10.5, y: 106.5 },
  { x: 21.5, y: 106 },
  { x: 5, y: 107 },
  { x: 27, y: 106.5 },
  { x: 32.5, y: 107 },
  { x: 16, y: 114 },
  { x: 10.5, y: 113.5 },
  { x: 21.5, y: 114 },
  { x: 5, y: 113 },
  { x: 27, y: 113.5 },
  { x: 32.5, y: 113 },
] as const;
const LOUNGE_DECORATION_LAYERS = ["effect", "border"] as const;

function goalScoreFor(
  definitionID: string | undefined,
  behaviorState: unknown,
): number | undefined {
  if (definitionID !== MINI_GOAL_DEFINITION_ID) return undefined;
  if (!behaviorState || typeof behaviorState !== "object") return 0;
  const score = (behaviorState as { goalScore?: unknown }).goalScore;
  return typeof score === "number" && Number.isInteger(score) && score >= 0
    ? score % 100
    : 0;
}

function isServerRejection(cause: unknown, serverCode: string) {
  if (!cause || typeof cause !== "object") return false;
  const error = cause as {
    code?: unknown;
    source?: unknown;
    details?: unknown;
  };
  if (
    error.code !== "server_rejected" ||
    error.source !== "protocol" ||
    !error.details ||
    typeof error.details !== "object"
  ) {
    return false;
  }
  return (
    (error.details as Readonly<Record<string, unknown>>).serverCode ===
    serverCode
  );
}

export function SharedLoungeCanvas({
  teamID,
  player,
  roster,
  assets = beachBoardwalkAssets,
  onStateChange,
  onPresenceChange,
}: {
  teamID: string;
  player: Player;
  roster: readonly Player[];
  assets?: AssetManifest;
  onStateChange(state: LoungeCanvasState): void;
  onPresenceChange(count: number): void;
}) {
  const mountRef = useRef<HTMLDivElement>(null);
  const { avatarConfig } = useAvatarIdentity();
  const playerID = player.id;
  const playerRef = useRef(player);
  const runtimeRef = useRef<CanvasRuntime | null>(null);
  const roomIDRef = useRef("");
  const rosterRef = useRef(roster);
  const editableItemIDsRef = useRef(new Set<string>());
  const optimisticItemMovesRef = useRef(
    new Map<
      string,
      {
        screen: Readonly<{ x: number; y: number }>;
        target: Readonly<{ x: number; y: number }>;
      }
    >(),
  );
  const projectionFrameRef = useRef<
    Pick<OverlayProjectionSnapshot, "canvasSize" | "viewport"> | undefined
  >(undefined);
  const trashTargetRef = useRef<HTMLDivElement>(null);
  const [overlays, setOverlays] = useState<LoungeAvatarOverlay[]>([]);
  const [itemOverlays, setItemOverlays] = useState<LoungeEditableItem[]>([]);
  const [choices, setChoices] =
    useState<LoungeItemChoice[]>(includedLoungeItems);
  const [visitorIDs, setVisitorIDs] = useState<readonly string[]>([]);
  const [selectedItem, setSelectedItem] = useState<LoungeItemChoice | null>(
    null,
  );
  const [selectedEntityID, setSelectedEntityID] = useState<string | null>(null);
  const [remainingPlacements, setRemainingPlacements] = useState(0);
  const [placementCapacity, setPlacementCapacity] = useState(0);
  const [placing, setPlacing] = useState(false);
  const [mutationPending, setMutationPending] = useState(false);
  const [dragState, setDragState] = useState<{
    entityID: string;
    overTrash: boolean;
  } | null>(null);
  const [actionMessage, setActionMessage] = useState("");
  const [activeReaction, setActiveReaction] = useState<
    | { sequence: number; playerID: string; kind: "emote"; emote: LoungeEmote }
    | {
        sequence: number;
        playerID: string;
        kind: "quickPhrase";
        phrase: LoungeQuickPhrase;
      }
    | null
  >(null);
  const [activeGoalCelebration, setActiveGoalCelebration] = useState<{
    sequence: number;
    entityID: string;
  } | null>(null);
  const [activeCannonEntityIDs, setActiveCannonEntityIDs] = useState(
    new Set<string>(),
  );
  const [reactionLocked, setReactionLocked] = useState(false);
  const [avatarDiameter, setAvatarDiameter] = useState<number>();
  const [benchAvatarDiameter, setBenchAvatarDiameter] = useState<number>();
  const reactionTimerRef = useRef<number | undefined>(undefined);
  const reactionSequenceRef = useRef(0);
  const goalCelebrationTimerRef = useRef<number | undefined>(undefined);
  const goalCelebrationSequenceRef = useRef(0);
  const cannonFuseTimerRefs = useRef(new Map<string, number>());
  useEffect(() => {
    rosterRef.current = roster;
  }, [roster]);

  useEffect(() => {
    playerRef.current = player;
  }, [player]);

  useEffect(
    () => () => {
      window.clearTimeout(reactionTimerRef.current);
      window.clearTimeout(goalCelebrationTimerRef.current);
      for (const timer of cannonFuseTimerRefs.current.values()) {
        window.clearTimeout(timer);
      }
      cannonFuseTimerRefs.current.clear();
    },
    [],
  );

  useEffect(() => {
    const mount = mountRef.current;
    if (!mount) return;
    let disposed = false;
    let runtime: CanvasRuntime | undefined;
    let participants: readonly ParticipantPresence[] = [];
    let projections: readonly OverlayEntityProjection[] = [];
    let canonicalEntities: readonly Readonly<RenderEntity>[] = [];
    let presented = false;
    let failureReported = false;
    let unsubscribePresence: () => void = () => undefined;
    let unsubscribeProjection: () => void = () => undefined;
    let unsubscribeCanonical: () => void = () => undefined;
    let unsubscribeLifecycle: () => void = () => undefined;
    let unsubscribeEffects: () => void = () => undefined;
    const stopPreservingNativeScroll = preserveNativeCanvasScroll(mount);
    const localAvatarEntityID = `avatar:${playerID}`;

    const failCanvas = (cause: unknown) => {
      if (disposed || failureReported) return;
      failureReported = true;
      if (isServerRejection(cause, "session_superseded")) {
        onStateChange("superseded");
        return;
      }
      if (isServerRejection(cause, "room_ownership_lost")) {
        onStateChange("ownership-lost");
        return;
      }
      console.error("The Lounge Canvas failed.", cause);
      onStateChange("error");
    };

    const publishOverlays = () => {
      if (disposed) return;
      const localProjection = projections.find(
        ({ entityId }) => entityId === localAvatarEntityID,
      );
      const localCanonical = canonicalEntities.find(
        ({ id, kind, userId }) =>
          id === localAvatarEntityID ||
          (kind === "avatar" && userId === playerID),
      );
      const canonicalProjection =
        !localProjection && localCanonical
          ? runtime?.projectWorldPoint(localCanonical)
          : undefined;
      const arrival = beachBoardwalkCanvas.spawnPoints.find(
        ({ id }) => id === "arrival",
      )?.position;
      const arrivalProjection =
        presented && !localProjection && !canonicalProjection && arrival
          ? runtime?.projectWorldPoint(arrival)
          : undefined;
      if (localProjection) {
        mount.dataset.playerX = localProjection.world.x.toFixed(3);
        mount.dataset.playerY = localProjection.world.y.toFixed(3);
      } else if (localCanonical) {
        mount.dataset.playerX = localCanonical.x.toFixed(3);
        mount.dataset.playerY = localCanonical.y.toFixed(3);
      } else if (arrivalProjection && arrival) {
        mount.dataset.playerX = arrival.x.toFixed(3);
        mount.dataset.playerY = arrival.y.toFixed(3);
      } else {
        delete mount.dataset.playerX;
        delete mount.dataset.playerY;
      }
      setOverlays(
        resolveLoungeAvatarOverlays({
          currentPlayer: playerRef.current,
          roster: rosterRef.current,
          participants,
          projections,
          benchProjections: LOUNGE_BENCH_ANCHORS.flatMap((anchor) => {
            const projection = runtime?.projectWorldPoint(anchor);
            return projection ? [projection] : [];
          }),
          currentAvatarProjection:
            localProjection ??
            (canonicalProjection
              ? {
                  screen: canonicalProjection.screen,
                  inViewport: canonicalProjection.inViewport,
                }
              : arrivalProjection
                ? {
                    screen: arrivalProjection.screen,
                    inViewport: arrivalProjection.inViewport,
                  }
                : undefined),
        }),
      );
      setItemOverlays(
        projections.flatMap((projection) => {
          const item = loungeItemForDefinition(projection.definitionId);
          const canonical = canonicalEntities.find(
            ({ id }) => id === projection.entityId,
          );
          if (
            !item?.glyph ||
            !projection.inViewport ||
            canonical?.kind !== "item" ||
            !canonical.itemRevision
          ) {
            return [];
          }
          const currentOwner = canonical.ownerUserId === playerID;
          const optimisticMove = optimisticItemMovesRef.current.get(
            projection.entityId,
          );
          const projectionCaughtUp =
            optimisticMove &&
            Math.hypot(
              projection.world.x - optimisticMove.target.x,
              projection.world.y - optimisticMove.target.y,
            ) < 0.01;
          if (projectionCaughtUp) {
            optimisticItemMovesRef.current.delete(projection.entityId);
          }
          return [
            {
              entityID: projection.entityId,
              label: item.label,
              glyph: item.glyph,
              imageSrc: item.imageSrc,
              kind: item.kind,
              editable:
                currentOwner &&
                editableItemIDsRef.current.has(projection.entityId),
              owner: currentOwner ? "current" : "teammate",
              itemRevision: canonical.itemRevision,
              goalScore: goalScoreFor(
                canonical.definitionId,
                canonical.behaviorState,
              ),
              screen:
                optimisticMove && !projectionCaughtUp
                  ? optimisticMove.screen
                  : projection.screen,
              transform: {
                x: canonical.x,
                y: canonical.y,
                rotation: canonical.rotation,
                scale: canonical.scale ?? 1,
              },
            },
          ];
        }),
      );
    };

    onStateChange("loading");
    void (async () => {
      const join = await prepareTeamLoungeJoin(teamID, playerID);
      if (disposed) return;
      roomIDRef.current = join.roomID;
      editableItemIDsRef.current = new Set(join.editableItemIDs);
      setRemainingPlacements(join.placementCredits);
      setPlacementCapacity(join.placementCapacity);
      setVisitorIDs(join.visitorIDs);
      const presentation = createLoungePixiPresentation({
        assets,
        definitions: [...beachBoardwalkDefinitions, ...loungeItemDefinitions],
        roster: rosterRef.current,
        currentPlayerID: playerID,
        avatarConfig,
      });
      void createConnectedPrizeBoxGateway()
        .inventory(["lounge_stamp", "lounge_prop"])
        .then((inventory) => {
          if (!disposed) setChoices(loungeItemChoices(inventory));
        })
        .catch(() => undefined);
      const { CanvasRuntime: Runtime, SimulationDriver } = await import(
        "@canvas-physics/client"
      );
      if (disposed) return;
      const worker = new Worker(
        new URL("./canvas.worker.ts", import.meta.url),
        {
          type: "module",
          name: "zoomigo-lounge-simulation",
        },
      );
      runtime = new Runtime({
        roomId: join.roomID,
        serverUrl: join.serverURL,
        credentialProvider: join.credentialProvider,
        mount,
        driver: new SimulationDriver(worker),
        definitions: presentation.definitions,
        assets: presentation.assets,
        scene: {
          background: 0x63c9dc,
          resolution: Math.min(devicePixelRatio, 2),
          projectEntityVisual: presentation.projectEntityVisual,
        },
        spawnPointId: "arrival",
        rates: {
          inputHz: 60,
          deltaHz: 30,
          keyframeHz: 2,
          checkpointHz: 1,
        },
        pointer: {
          mode: "avatarDrag",
          deadZonePx: 2,
          grabRadiusPx: 44,
          flick: false,
        },
        hideDisabledAvatars: true,
        onError: failCanvas,
      });
      runtimeRef.current = runtime;
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
      unsubscribeCanonical = runtime.subscribeCanonicalState(({ entities }) => {
        canonicalEntities = entities;
        publishOverlays();
      });
      unsubscribeProjection = runtime.subscribeOverlayProjection(
        (snapshot) => {
          projections = snapshot.entities;
          const nextAvatarDiameter =
            Math.round(
              snapshot.viewport.scale * LOUNGE_AVATAR_DIAMETER_WORLD * 10,
            ) / 10;
          setAvatarDiameter((current) =>
            current === nextAvatarDiameter ? current : nextAvatarDiameter,
          );
          const nextBenchAvatarDiameter =
            Math.round(
              snapshot.viewport.scale * LOUNGE_BENCH_AVATAR_DIAMETER_WORLD * 10,
            ) / 10;
          setBenchAvatarDiameter((current) =>
            current === nextBenchAvatarDiameter
              ? current
              : nextBenchAvatarDiameter,
          );
          projectionFrameRef.current = {
            canvasSize: snapshot.canvasSize,
            viewport: snapshot.viewport,
          };
          const ball = snapshot.entities.find(
            ({ entityId }) => entityId === loungeBallEntityID,
          );
          publishLoungeBallPosition(
            mount,
            ball ? { ...ball.world, rotation: ball.rotation } : undefined,
          );
          publishOverlays();
        },
        { kinds: ["avatar", "item"], maxEntities: 200, maxHz: 60 },
      );
      unsubscribeLifecycle = runtime.subscribeLifecycle(({ state }) => {
        if (state === "reconnecting") onStateChange("loading");
        if (state === "failed") onStateChange("error");
      });
      unsubscribeEffects = runtime.subscribeEffects((effect) => {
        if (
          effect.effect === "lounge.cannon-fuse" &&
          typeof effect.entityId === "string"
        ) {
          const entityID = effect.entityId;
          const requestedDuration = effect.params?.durationSeconds;
          const durationMilliseconds =
            typeof requestedDuration === "number" &&
            Number.isFinite(requestedDuration)
              ? Math.min(3_000, Math.max(200, requestedDuration * 1_000))
              : 800;
          window.clearTimeout(cannonFuseTimerRefs.current.get(entityID));
          setActiveCannonEntityIDs((current) => new Set(current).add(entityID));
          cannonFuseTimerRefs.current.set(
            entityID,
            window.setTimeout(() => {
              cannonFuseTimerRefs.current.delete(entityID);
              setActiveCannonEntityIDs((current) => {
                const next = new Set(current);
                next.delete(entityID);
                return next;
              });
            }, durationMilliseconds),
          );
          return;
        }
        if (
          effect.effect === "lounge.cannon" &&
          typeof effect.entityId === "string"
        ) {
          const entityID = effect.entityId;
          window.clearTimeout(cannonFuseTimerRefs.current.get(entityID));
          cannonFuseTimerRefs.current.delete(entityID);
          setActiveCannonEntityIDs((current) => {
            const next = new Set(current);
            next.delete(entityID);
            return next;
          });
          return;
        }
        if (effect.effect === "lounge.goal-confetti") {
          setActiveGoalCelebration({
            sequence: ++goalCelebrationSequenceRef.current,
            entityID: effect.entityId,
          });
          window.clearTimeout(goalCelebrationTimerRef.current);
          goalCelebrationTimerRef.current = window.setTimeout(
            () => setActiveGoalCelebration(null),
            GOAL_CELEBRATION_DURATION_MS,
          );
          return;
        }
        const reactionPlayerID = effect.params?.playerId;
        if (typeof reactionPlayerID !== "string") return;
        if (effect.effect === "zoomigo.emote") {
          const received = loungeEmotes.find(
            ({ id }) => id === effect.params?.emote,
          );
          if (!received) return;
          setActiveReaction({
            sequence: ++reactionSequenceRef.current,
            playerID: reactionPlayerID,
            kind: "emote",
            emote: received,
          });
        } else if (effect.effect === "zoomigo.quickPhrase") {
          const received = loungeQuickPhrases.find(
            ({ id }) => id === effect.params?.phrase,
          );
          if (!received) return;
          setActiveReaction({
            sequence: ++reactionSequenceRef.current,
            playerID: reactionPlayerID,
            kind: "quickPhrase",
            phrase: received,
          });
        } else {
          return;
        }
        window.clearTimeout(reactionTimerRef.current);
        reactionTimerRef.current = window.setTimeout(
          () => setActiveReaction(null),
          LOUNGE_REACTION_DURATION_MS,
        );
      });
      await runtime.start({ until: "presented" });
      if (!disposed) {
        presented = true;
        publishOverlays();
        onStateChange("ready");
      }
    })().catch(failCanvas);

    return () => {
      disposed = true;
      unsubscribePresence();
      unsubscribeProjection();
      unsubscribeCanonical();
      unsubscribeLifecycle();
      unsubscribeEffects();
      stopPreservingNativeScroll();
      const active = runtime;
      runtime = undefined;
      runtimeRef.current = null;
      roomIDRef.current = "";
      projectionFrameRef.current = undefined;
      if (active) void active.stopGracefully(500).catch(() => active.stop());
    };
  }, [assets, avatarConfig, onPresenceChange, onStateChange, playerID, teamID]);

  const placeItem = async (event: MouseEvent<HTMLButtonElement>) => {
    const runtime = runtimeRef.current;
    const roomID = roomIDRef.current;
    const mount = mountRef.current;
    if (!runtime || !roomID || !mount || !selectedItem || placing) return;
    const bounds = mount.getBoundingClientRect();
    const point = {
      x: Math.max(
        5,
        Math.min(95, ((event.clientX - bounds.left) / bounds.width) * 100),
      ),
      y: Math.max(
        5,
        Math.min(145, ((event.clientY - bounds.top) / bounds.height) * 150),
      ),
    };
    setPlacing(true);
    try {
      const recovered = await recoverPendingTeamLoungePlacement(
        teamID,
        playerID,
        roomID,
      );
      if (recovered !== null) setRemainingPlacements(recovered);
      const idempotencyKey = crypto.randomUUID();
      rememberPendingTeamLoungePlacement(
        teamID,
        playerID,
        roomID,
        idempotencyKey,
      );
      const reservation = await reserveTeamLoungePlacement(
        teamID,
        roomID,
        selectedItem.definitionId,
        selectedItem.definitionVersion,
        point,
        idempotencyKey,
      );
      setRemainingPlacements(reservation.remaining);
      const outcome = await runtime.spawnItem(
        selectedItem.definitionId,
        reservation.position,
        0,
        1,
        {
          authorizationEvidence: new TextEncoder().encode(reservation.permit),
          applicationCorrelationId: reservation.placementID,
        },
      ).settled;
      clearPendingTeamLoungePlacement(teamID, playerID, idempotencyKey);
      if (outcome.status === "accepted" && outcome.item?.entityId) {
        editableItemIDsRef.current.add(outcome.item.entityId);
        setItemOverlays((current) =>
          current.map((item) =>
            item.entityID === outcome.item?.entityId
              ? { ...item, editable: true }
              : item,
          ),
        );
        setActionMessage(`${selectedItem.label} placed.`);
        setSelectedItem(null);
      } else {
        setActionMessage(
          outcome.status === "rejected"
            ? placementRejectionMessage(outcome.code)
            : "That item could not be placed.",
        );
      }
    } catch (error) {
      setActionMessage(
        error instanceof Error && !(error instanceof TypeError)
          ? error.message
          : "That item could not be placed.",
      );
    } finally {
      setPlacing(false);
    }
  };

  const mutateItem = async (
    item: LoungeEditableItem,
    kind: TeamLoungeItemMutationKind,
    transform: TeamLoungeItemTransform | null,
    rollbackScreen?: Readonly<{ x: number; y: number }>,
  ) => {
    const runtime = runtimeRef.current;
    const roomID = roomIDRef.current;
    if (!runtime || !roomID || mutationPending) return;
    setMutationPending(true);
    try {
      const mutation = await performLoungeItemMutation({
        runtime,
        requestPermit: requestTeamLoungeItemMutationPermit,
        teamID,
        roomID,
        item,
        kind,
        transform,
        idempotencyKey: crypto.randomUUID(),
      });
      const { outcome } = mutation;
      if (outcome.status === "accepted") {
        if (kind === "delete") {
          editableItemIDsRef.current.delete(item.entityID);
          setItemOverlays((current) =>
            current.filter(({ entityID }) => entityID !== item.entityID),
          );
          setRemainingPlacements((current) => current + 1);
          setSelectedEntityID(null);
          setActionMessage(`${item.label} removed.`);
        } else {
          setItemOverlays((current) =>
            current.map((currentItem) =>
              currentItem.entityID === item.entityID
                ? {
                    ...currentItem,
                    itemRevision: outcome.itemRevision,
                    transform:
                      mutation.targetTransform ?? currentItem.transform,
                  }
                : currentItem,
            ),
          );
          setActionMessage(`${item.label} updated.`);
        }
      } else {
        setItemOverlays((current) =>
          current.map((currentItem) =>
            currentItem.entityID === item.entityID
              ? {
                  ...currentItem,
                  itemRevision: item.itemRevision,
                  transform: mutation.currentTransform,
                }
              : currentItem,
          ),
        );
        if (rollbackScreen) {
          optimisticItemMovesRef.current.delete(item.entityID);
          setItemOverlays((current) =>
            current.map((currentItem) =>
              currentItem.entityID === item.entityID
                ? { ...currentItem, screen: rollbackScreen }
                : currentItem,
            ),
          );
        }
        setActionMessage(itemMutationRejectionMessage(outcome.status));
      }
    } catch (error) {
      if (error instanceof TeamLoungeItemRevisionError) {
        optimisticItemMovesRef.current.delete(item.entityID);
        const projection = runtime.projectWorldPoint(error.transform);
        setItemOverlays((current) =>
          current.map((currentItem) =>
            currentItem.entityID === error.entityID
              ? {
                  ...currentItem,
                  itemRevision: error.itemRevision,
                  transform: error.transform,
                  screen: projection?.screen ?? currentItem.screen,
                }
              : currentItem,
          ),
        );
      }
      if (rollbackScreen && !(error instanceof TeamLoungeItemRevisionError)) {
        optimisticItemMovesRef.current.delete(item.entityID);
        setItemOverlays((current) =>
          current.map((currentItem) =>
            currentItem.entityID === item.entityID
              ? { ...currentItem, screen: rollbackScreen }
              : currentItem,
          ),
        );
      }
      setActionMessage(
        error instanceof Error
          ? error.message
          : "That Lounge item could not be changed.",
      );
    } finally {
      setMutationPending(false);
      setDragState(null);
    }
  };

  const sendReaction = async (
    action: "zoomigo.emote" | "zoomigo.quickPhrase",
    payload: { emote: string } | { phrase: string },
    sentMessage: string,
  ) => {
    const runtime = runtimeRef.current;
    if (!runtime || reactionLocked) return;
    setReactionLocked(true);
    try {
      const result = await runtime.submitTransientAction({
        action,
        target: "room",
        payload,
      }).result;
      setActionMessage(
        result.accepted
          ? sentMessage
          : transientActionRejectionMessage(result.rejectCode),
      );
    } catch {
      setActionMessage("That reaction could not be sent.");
    } finally {
      setReactionLocked(false);
    }
  };

  const showEmote = (next: LoungeEmote) =>
    sendReaction("zoomigo.emote", { emote: next.id }, `${next.label} sent.`);

  const showQuickPhrase = (next: LoungeQuickPhrase) =>
    sendReaction(
      "zoomigo.quickPhrase",
      { phrase: next.id },
      `${next.text} sent.`,
    );

  const selectedEditableEntityID = itemOverlays.some(
    ({ entityID }) => entityID === selectedEntityID,
  )
    ? selectedEntityID
    : null;
  return (
    <>
      <div
        className="team-lounge__playfield"
        onClick={(event) => {
          if (
            event.target instanceof Element &&
            event.target.closest("[data-canvas-pointer-ignore='true']")
          ) {
            return;
          }
          setSelectedEntityID(null);
        }}
      >
        <div
          ref={mountRef}
          className="team-lounge__stage"
          aria-label="Interactive lounge canvas"
          tabIndex={0}
        />
        {overlays.map(({ player, position, current, state }) => (
          <div
            className="team-lounge__shared-avatar"
            data-current={current || undefined}
            data-presence={state}
            key={player.id}
            role={current ? undefined : "img"}
            aria-label={
              current
                ? undefined
                : state === "bench"
                  ? copy.teamLounge.benchAvatarLabel(
                      player.firstName,
                      player.lastInitial,
                    )
                  : `${player.firstName} ${player.lastInitial}`
            }
            style={{
              transform: `translate3d(${position.x}px, ${position.y}px, 0)`,
              ...(state === "bench" && benchAvatarDiameter
                ? ({
                    "--lounge-avatar-size": `${benchAvatarDiameter}px`,
                  } as CSSProperties)
                : avatarDiameter
                  ? ({
                      "--lounge-avatar-size": `${avatarDiameter}px`,
                    } as CSSProperties)
                  : undefined),
            }}
          >
            {current ? (
              <div
                className="team-lounge__avatar-decoration"
                aria-hidden="true"
              >
                <AvatarArt
                  config={avatarConfig}
                  background="transparent"
                  layerKinds={LOUNGE_DECORATION_LAYERS}
                />
              </div>
            ) : state === "bench" ? (
              <div
                className="team-lounge__avatar-decoration team-lounge__avatar-decoration--bench"
                aria-hidden="true"
              >
                <AvatarArt
                  config={normalizeAvatar(player.avatarConfiguration ?? {})}
                />
              </div>
            ) : null}
            {current ? (
              <button
                type="button"
                className="team-lounge__avatar-grab-target"
                aria-label={`${player.firstName} ${player.lastInitial}, you`}
                title={copy.teamLounge.avatarMoveHint}
                data-canvas-pointer-ignore="true"
                onPointerDown={(event) => {
                  const canvas = mountRef.current?.querySelector("canvas");
                  if (canvas) {
                    relayAvatarPointerDown(canvas, event.nativeEvent);
                  }
                }}
              />
            ) : null}
            <span aria-hidden={state === "bench" || undefined}>
              {current ? "You" : state === "bench" ? "✓" : player.firstName}
            </span>
            {activeReaction?.playerID === player.id &&
            activeReaction.kind === "emote" ? (
              <b
                key={activeReaction.sequence}
                className="team-lounge__avatar-emote"
                role="img"
                aria-label={activeReaction.emote.label}
              >
                {activeReaction.emote.symbol}
              </b>
            ) : null}
            {activeReaction?.playerID === player.id &&
            activeReaction.kind === "quickPhrase" ? (
              <b
                key={activeReaction.sequence}
                className="team-lounge__avatar-phrase"
                aria-live="polite"
              >
                {activeReaction.phrase.text}
              </b>
            ) : null}
          </div>
        ))}
        <LoungeItemEditor
          items={itemOverlays}
          paintArtwork={false}
          activeCannonEntityIDs={activeCannonEntityIDs}
          selectedEntityID={selectedEditableEntityID}
          pending={mutationPending}
          dragging={dragState}
          trashTargetRef={trashTargetRef}
          onSelect={(item) => {
            setSelectedItem(null);
            setSelectedEntityID(item.entityID);
          }}
          onMove={(item, screen) => {
            const frame = projectionFrameRef.current;
            if (!frame) return;
            const target = loungeWorldPoint(
              screen,
              frame.viewport,
              frame.canvasSize,
            );
            if (!target) {
              setActionMessage("Keep that item inside the Lounge.");
              return;
            }
            optimisticItemMovesRef.current.set(item.entityID, {
              screen,
              target,
            });
            setItemOverlays((current) =>
              current.map((currentItem) =>
                currentItem.entityID === item.entityID
                  ? { ...currentItem, screen }
                  : currentItem,
              ),
            );
            void mutateItem(
              item,
              "transform",
              {
                ...item.transform,
                ...target,
              },
              item.screen,
            );
          }}
          onRotate={(item, rotation) =>
            void mutateItem(item, "rotation", {
              ...item.transform,
              rotation,
            })
          }
          onScale={(item, scale) =>
            void mutateItem(item, "scale", { ...item.transform, scale })
          }
          onDelete={(item) => void mutateItem(item, "delete", null)}
          onFinish={() => setSelectedEntityID(null)}
          onDragStateChange={setDragState}
        />
        {activeGoalCelebration ? (
          <div
            key={activeGoalCelebration.sequence}
            className="team-lounge__goal-confetti"
            role="status"
          >
            <span className="sr-only">{copy.teamLounge.goalCelebration}</span>
            {Array.from(
              { length: GOAL_CONFETTI_PARTICLE_COUNT },
              (_, index) => (
                <i
                  key={index}
                  aria-hidden="true"
                  style={
                    {
                      "--confetti-origin-x": `${45 + ((index * 17) % 11)}%`,
                      "--confetti-x": `${((index * 47) % 101) - 50}vw`,
                      "--confetti-mid-x": `${((index * 31) % 71) - 35}vw`,
                      "--confetti-rise": `${-(30 + ((index * 29) % 65))}vh`,
                      "--confetti-fall": `${20 + ((index * 19) % 65)}vh`,
                      "--confetti-delay": `${(index % 8) * 0.035}s`,
                      "--confetti-duration": `${1.9 + (index % 7) * 0.1}s`,
                      "--confetti-mid-spin": `${210 + ((index * 31) % 420)}deg`,
                      "--confetti-spin": `${360 + ((index * 53) % 720)}deg`,
                      "--confetti-size": `${0.28 + (index % 5) * 0.055}rem`,
                      "--confetti-color":
                        GOAL_CONFETTI_COLORS[
                          index % GOAL_CONFETTI_COLORS.length
                        ],
                    } as CSSProperties
                  }
                />
              ),
            )}
          </div>
        ) : null}
        {visitorIDs.flatMap((visitorID, index) => {
          if (overlays.some(({ player }) => player.id === visitorID)) return [];
          const visitor = roster.find(({ id }) => id === visitorID);
          const anchor = visitorAnchors[index];
          return visitor && anchor ? (
            <div
              key={`visitor:${visitorID}`}
              className="team-lounge__visitor-trace"
              aria-label={`${visitor.firstName} visited this week`}
              style={{
                left: `${anchor.x}%`,
                top: `${(anchor.y / 150) * 100}%`,
              }}
            >
              <PlayerAvatar player={visitor} size="small" />
            </div>
          ) : (
            []
          );
        })}
        {selectedItem ? (
          <button
            type="button"
            className="team-lounge__placement-surface"
            aria-label={`Place ${selectedItem.label} ${selectedItem.kind === "lounge_prop" ? "item" : "stamp"} on the boardwalk`}
            disabled={placing || remainingPlacements === 0}
            onClick={placeItem}
          >
            <span>{copy.teamLounge.actions.placeHint(selectedItem.label)}</span>
            <b aria-hidden="true">
              <LoungeItemArt item={selectedItem} decorative />
            </b>
          </button>
        ) : null}
      </div>
      {dragState ? (
        <div
          ref={trashTargetRef}
          className="team-lounge__trash-target"
          data-active={dragState.overTrash || undefined}
          aria-label={copy.teamLounge.actions.deleteItem}
          role="status"
        >
          <span aria-hidden="true">⌫</span>
          <strong>
            {dragState.overTrash
              ? copy.teamLounge.actions.releaseToDelete
              : copy.teamLounge.actions.dropToDelete}
          </strong>
          <small>{copy.teamLounge.actions.deleteHint}</small>
        </div>
      ) : (
        <LoungeActionDock
          choices={choices}
          selectedItem={selectedItem}
          remaining={remainingPlacements}
          capacity={placementCapacity}
          placing={placing}
          reactionLocked={reactionLocked}
          onSelectItem={(item) => {
            setSelectedEntityID(null);
            setSelectedItem(item);
          }}
          onSendEmote={showEmote}
          onSendQuickPhrase={showQuickPhrase}
        />
      )}
      <span className="sr-only" role="status">
        {actionMessage}
      </span>
    </>
  );
}

function placementRejectionMessage(rejectCode: string): string {
  switch (rejectCode) {
    case "outside_canvas":
      return "Place that item farther inside the Lounge.";
    case "application_policy":
    case "application_correlation_conflict":
      return "That placement permit is no longer available.";
    case "application_unavailable":
      return "Placement is temporarily unavailable. Try again.";
    default:
      return "That item could not be placed.";
  }
}

function itemMutationRejectionMessage(status: string): string {
  return status === "rejected"
    ? "That item changed before your edit. Try it again."
    : "That Lounge item could not be changed.";
}

function transientActionRejectionMessage(
  rejectCode: TransientActionRejectCode,
): string {
  switch (rejectCode) {
    case TransientActionRejectCode.TRANSIENT_ACTION_REJECT_UNAUTHORIZED:
    case TransientActionRejectCode.TRANSIENT_ACTION_REJECT_RATE_LIMITED:
      return "Wait a moment before sending another reaction.";
    case TransientActionRejectCode.TRANSIENT_ACTION_REJECT_UNAVAILABLE:
    case TransientActionRejectCode.TRANSIENT_ACTION_REJECT_INTERNAL:
      return "Reactions are temporarily unavailable.";
    default:
      return "That reaction could not be sent.";
  }
}
