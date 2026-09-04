"use client";

import {
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type MouseEvent,
} from "react";
import { createPortal } from "react-dom";
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
import { developmentBuild } from "../build-profile";
import { copy } from "../content/copy";
import { createConnectedPrizeBoxGateway } from "../data/prize-box-gateway";
import { unlockDevelopmentCatalogItems } from "../development/catalog-unlocks";
import type { Player } from "../domain/types";
import { useAvatarIdentity } from "../state/avatar-identity-context";
import type { LoungeCanvasState } from "./LocalLoungeCanvas";
import { LoungeActionDock } from "./LoungeActionDock";
import { LoungeChatSettings } from "./LoungeChatSettings";
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
  defaultDevelopmentLoungeChatPackIDs,
  includedLoungeChatPackIDs,
  loungeQuickPhrases,
  unlockedLoungeChatPackIDs,
  type LoungeChatPackID,
  type LoungeQuickPhrase,
} from "./lounge-quick-phrases";
import {
  loadLoungeChatPackIDs,
  saveLoungeChatPackIDs,
} from "./lounge-chat-preferences";
import { performLoungeItemMutation } from "./lounge-item-mutations";
import { createLoungeItemMutationQueue } from "./lounge-item-mutation-queue";
import {
  includedLoungeItems,
  LoungeVisualLayer,
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
import { beachBoardwalkDefinitions } from "./scene/beach-boardwalk";
import { createLoungePixiPresentation } from "./scene/pixi-presentation";
import { createPersistentLoungeTransport } from "./lounge-room-transport";

const visitorAnchors = [
  { x: 8, y: 74 },
  { x: 74, y: 81 },
  { x: 48, y: 125 },
] as const;

const MINI_GOAL_DEFINITION_ID = "zoomigo-prop-play-mini-goal";
const DUCK_POND_DEFINITION_ID = "zoomigo-prop-play-duck-pond";
const HAMMOCK_DEFINITION_ID = "zoomigo-prop-play-hammock";
const PINBALL_BUMPER_DEFINITION_ID = "zoomigo-prop-play-pinball-bumper";
const GOAL_CELEBRATION_DURATION_MS = 2_800;
const GOAL_CONFETTI_PARTICLE_COUNT = 100;
const GOAL_CONFETTI_COLORS = ["#ffdc3f", "#22d3a8", "#ff617c", "#7dd3fc"];
const LOUNGE_AVATAR_DIAMETER_WORLD = 13.5;
const LOUNGE_BENCH_AVATAR_DIAMETER_WORLD = 9.6;
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
const INITIAL_UNLOCKED_CHAT_PACK_IDS = unlockedLoungeChatPackIDs(
  [],
  developmentBuild,
);
const DEFAULT_ACTIVE_CHAT_PACK_IDS = developmentBuild
  ? defaultDevelopmentLoungeChatPackIDs
  : includedLoungeChatPackIDs;

function loadSavedChatPacks(
  storage: Storage,
  unlocked: readonly LoungeChatPackID[],
) {
  return loadLoungeChatPackIDs(storage, unlocked, DEFAULT_ACTIVE_CHAT_PACK_IDS);
}

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

function duckFlockFor(
  definitionID: string | undefined,
  behaviorState: unknown,
): { heading: number; intensity: number } | undefined {
  if (
    definitionID !== DUCK_POND_DEFINITION_ID ||
    !behaviorState ||
    typeof behaviorState !== "object"
  ) {
    return undefined;
  }
  const flock = behaviorState as {
    flockHeading?: unknown;
    flockIntensity?: unknown;
  };
  return {
    heading:
      typeof flock.flockHeading === "number" &&
      Number.isFinite(flock.flockHeading)
        ? flock.flockHeading
        : 0,
    intensity:
      typeof flock.flockIntensity === "number" &&
      Number.isFinite(flock.flockIntensity)
        ? Math.max(0, Math.min(1, flock.flockIntensity))
        : 0,
  };
}

function hammockOccupiedFor(
  definitionID: string | undefined,
  behaviorState: unknown,
): boolean | undefined {
  if (definitionID !== HAMMOCK_DEFINITION_ID) return undefined;
  if (!behaviorState || typeof behaviorState !== "object") return false;
  return (
    (behaviorState as { hammockOccupied?: unknown }).hammockOccupied === true
  );
}

function hammockOccupantFor(
  definitionID: string | undefined,
  behaviorState: unknown,
): string | undefined {
  if (
    definitionID !== HAMMOCK_DEFINITION_ID ||
    !behaviorState ||
    typeof behaviorState !== "object"
  ) {
    return undefined;
  }
  const occupant = (behaviorState as { hammockOccupantID?: unknown })
    .hammockOccupantID;
  return typeof occupant === "string" ? occupant : undefined;
}

function bumperSequenceFor(
  definitionID: string | undefined,
  behaviorState: unknown,
): number | undefined {
  if (definitionID !== PINBALL_BUMPER_DEFINITION_ID) return undefined;
  if (!behaviorState || typeof behaviorState !== "object") return 0;
  const sequence = (behaviorState as { bumperSequence?: unknown })
    .bumperSequence;
  return typeof sequence === "number" && Number.isSafeInteger(sequence)
    ? Math.max(0, sequence)
    : 0;
}

function wobbleSequenceFor(
  definitionID: string | undefined,
  behaviorState: unknown,
): number | undefined {
  if (definitionID !== "zoomigo-prop-play-wobble-cone") return undefined;
  if (!behaviorState || typeof behaviorState !== "object") return 0;
  const sequence = (behaviorState as { wobbleSequence?: unknown })
    .wobbleSequence;
  return typeof sequence === "number" && Number.isSafeInteger(sequence)
    ? Math.max(0, sequence)
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
  settingsContainer,
  onStateChange,
  onPresenceChange,
}: {
  teamID: string;
  player: Player;
  roster: readonly Player[];
  assets?: AssetManifest;
  settingsContainer?: Element | null;
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
  const optimisticItemTransformsRef = useRef(
    new Map<string, TeamLoungeItemTransform>(),
  );
  const mutationLabelsRef = useRef(new Map<string, string>());
  const mutationQueueRef = useRef<
    ReturnType<typeof createLoungeItemMutationQueue> | undefined
  >(undefined);
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
  const [unlockedChatPackIDs, setUnlockedChatPackIDs] = useState<
    LoungeChatPackID[]
  >(INITIAL_UNLOCKED_CHAT_PACK_IDS);
  const [activeChatPackIDs, setActiveChatPackIDs] = useState<
    LoungeChatPackID[]
  >([...DEFAULT_ACTIVE_CHAT_PACK_IDS]);
  const [avatarDiameter, setAvatarDiameter] = useState<number>();
  const [benchAvatarDiameter, setBenchAvatarDiameter] = useState<number>();
  const [connectionState, setConnectionState] = useState<
    "online" | "reconnecting"
  >("online");
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
    const queue = createLoungeItemMutationQueue({
      execute: async ({ item, kind, transform }) => {
        const runtime = runtimeRef.current;
        const roomID = roomIDRef.current;
        if (!runtime || !roomID) {
          return {
            status: "rejected" as const,
            itemRevision: item.itemRevision,
            transform: item.transform,
            error: new Error("That Lounge item could not be changed."),
          };
        }
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
          if (mutation.outcome.status === "accepted") {
            return {
              status: "accepted" as const,
              itemRevision: mutation.outcome.itemRevision,
              transform: mutation.targetTransform,
            };
          }
          return {
            status: "rejected" as const,
            itemRevision: item.itemRevision,
            transform: mutation.currentTransform,
            error: new Error(
              itemMutationRejectionMessage(mutation.outcome.status),
            ),
          };
        } catch (error) {
          if (error instanceof TeamLoungeItemRevisionError) {
            return {
              status: "rejected" as const,
              itemRevision: error.itemRevision,
              transform: error.transform,
              error,
            };
          }
          return {
            status: "rejected" as const,
            itemRevision: item.itemRevision,
            transform: item.transform,
            error,
          };
        }
      },
      onOptimistic: (entityID, transform) => {
        optimisticItemTransformsRef.current.set(entityID, transform);
        setItemOverlays((current) =>
          current.map((item) =>
            item.entityID === entityID ? { ...item, transform } : item,
          ),
        );
      },
      onAccepted: (entityID, authoritative, displayedTransform) => {
        optimisticItemTransformsRef.current.set(entityID, displayedTransform);
        setItemOverlays((current) =>
          current.map((item) =>
            item.entityID === entityID
              ? {
                  ...item,
                  itemRevision: authoritative.itemRevision,
                  transform: displayedTransform,
                }
              : item,
          ),
        );
        const label = mutationLabelsRef.current.get(entityID);
        if (label) setActionMessage(`${label} updated.`);
      },
      onDeleted: (entityID) => {
        const label = mutationLabelsRef.current.get(entityID) ?? "Item";
        mutationLabelsRef.current.delete(entityID);
        optimisticItemMovesRef.current.delete(entityID);
        optimisticItemTransformsRef.current.delete(entityID);
        editableItemIDsRef.current.delete(entityID);
        setItemOverlays((current) =>
          current.filter((item) => item.entityID !== entityID),
        );
        setRemainingPlacements((current) => current + 1);
        setSelectedEntityID(null);
        setActionMessage(`${label} removed.`);
      },
      onRejected: (entityID, authoritative, error) => {
        optimisticItemMovesRef.current.delete(entityID);
        optimisticItemTransformsRef.current.delete(entityID);
        const projection = runtimeRef.current?.projectWorldPoint(
          authoritative.transform,
        );
        setItemOverlays((current) =>
          current.map((item) =>
            item.entityID === entityID
              ? {
                  ...item,
                  itemRevision: authoritative.itemRevision,
                  transform: authoritative.transform,
                  screen: projection?.screen ?? item.screen,
                }
              : item,
          ),
        );
        setActionMessage(
          error instanceof Error
            ? error.message
            : "That Lounge item could not be changed.",
        );
      },
      onPendingChange: setMutationPending,
    });
    mutationQueueRef.current = queue;
    return () => {
      queue.dispose();
      if (mutationQueueRef.current === queue) {
        mutationQueueRef.current = undefined;
      }
    };
  }, [teamID]);

  useEffect(() => {
    const mount = mountRef.current;
    if (!mount) return;
    const optimisticItemMoves = optimisticItemMovesRef.current;
    const optimisticItemTransforms = optimisticItemTransformsRef.current;
    let disposed = false;
    let runtime: CanvasRuntime | undefined;
    let participants: readonly ParticipantPresence[] = [];
    let projections: readonly OverlayEntityProjection[] = [];
    let canonicalEntities: readonly Readonly<RenderEntity>[] = [];
    const visualDefinitions = new Map(
      [...beachBoardwalkDefinitions, ...loungeItemDefinitions].map(
        (definition) => [definition.definitionId, definition.visual] as const,
      ),
    );
    let failureReported = false;
    let unsubscribePresence: () => void = () => undefined;
    let unsubscribeProjection: () => void = () => undefined;
    let unsubscribeCanonical: () => void = () => undefined;
    let unsubscribeLifecycle: () => void = () => undefined;
    let unsubscribeEffects: () => void = () => undefined;
    const stopPreservingNativeScroll = preserveNativeCanvasScroll(mount);
    const localAvatarEntityID = `avatar:${playerID}`;
    const updateConnectionState = (next: "online" | "reconnecting") => {
      if (disposed) return;
      setConnectionState(next);
      if (next === "reconnecting") {
        setSelectedItem(null);
        setSelectedEntityID(null);
        setDragState(null);
        runtime?.clearItemEditSelection();
      }
    };

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
      if (localProjection) {
        mount.dataset.playerX = localProjection.world.x.toFixed(3);
        mount.dataset.playerY = localProjection.world.y.toFixed(3);
      } else if (localCanonical) {
        mount.dataset.playerX = localCanonical.x.toFixed(3);
        mount.dataset.playerY = localCanonical.y.toFixed(3);
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
        }),
      );
      setItemOverlays(
        projections.flatMap((projection) => {
          const item = loungeItemForDefinition(projection.definitionId);
          const canonical = canonicalEntities.find(
            ({ id }) => id === projection.entityId,
          );
          const visual = projection.definitionId
            ? visualDefinitions.get(projection.definitionId)
            : undefined;
          if (
            !item?.glyph ||
            !projection.inViewport ||
            canonical?.kind !== "item" ||
            !visual
          ) {
            return [];
          }
          const systemOwned = !canonical.ownerUserId;
          const currentOwner = canonical.ownerUserId === playerID;
          const optimisticMove = optimisticItemMovesRef.current.get(
            projection.entityId,
          );
          const canonicalTransform: TeamLoungeItemTransform = {
            x: canonical.x,
            y: canonical.y,
            rotation: canonical.rotation,
            scale: canonical.scale ?? 1,
          };
          const optimisticTransform = optimisticItemTransformsRef.current.get(
            projection.entityId,
          );
          const transformCaughtUp =
            optimisticTransform &&
            Math.abs(canonicalTransform.x - optimisticTransform.x) < 0.01 &&
            Math.abs(canonicalTransform.y - optimisticTransform.y) < 0.01 &&
            Math.abs(
              canonicalTransform.rotation - optimisticTransform.rotation,
            ) < 0.0001 &&
            Math.abs(canonicalTransform.scale - optimisticTransform.scale) <
              0.0001;
          if (transformCaughtUp) {
            optimisticItemTransformsRef.current.delete(projection.entityId);
          }
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
              maxScale: item.maxScale,
              artOffset: item.artOffset,
              kind: item.kind,
              editable:
                currentOwner &&
                Boolean(canonical.itemRevision) &&
                editableItemIDsRef.current.has(projection.entityId),
              owner: systemOwned
                ? "system"
                : currentOwner
                  ? "current"
                  : "teammate",
              itemRevision: canonical.itemRevision ?? 0,
              visualLayer: visual.zIndex ?? 0,
              visualSize:
                item.kind === "lounge_prop"
                  ? {
                      width:
                        visual.size.width *
                        (projectionFrameRef.current?.viewport.scale ?? 1),
                      height:
                        visual.size.height *
                        (projectionFrameRef.current?.viewport.scale ?? 1),
                    }
                  : undefined,
              goalScore: goalScoreFor(
                canonical.definitionId,
                canonical.behaviorState,
              ),
              duckFlock: duckFlockFor(
                canonical.definitionId,
                canonical.behaviorState,
              ),
              hammockOccupied: hammockOccupiedFor(
                canonical.definitionId,
                canonical.behaviorState,
              ),
              hammockOccupantID: hammockOccupantFor(
                canonical.definitionId,
                canonical.behaviorState,
              ),
              bumperSequence: bumperSequenceFor(
                canonical.definitionId,
                canonical.behaviorState,
              ),
              wobbleSequence: wobbleSequenceFor(
                canonical.definitionId,
                canonical.behaviorState,
              ),
              screen:
                optimisticMove && !projectionCaughtUp
                  ? optimisticMove.screen
                  : projection.screen,
              transform:
                optimisticTransform && !transformCaughtUp
                  ? optimisticTransform
                  : canonicalTransform,
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
      });
      const inventoryGateway = createConnectedPrizeBoxGateway();
      const loadInventory = async () => {
        if (developmentBuild) {
          await unlockDevelopmentCatalogItems().catch(() => undefined);
        }
        return inventoryGateway.inventory([
          "lounge_stamp",
          "lounge_prop",
          "lounge_chat_pack",
        ]);
      };
      void loadInventory()
        .then((inventory) => {
          if (disposed) return;
          setChoices(loungeItemChoices(inventory));
          const unlocked = unlockedLoungeChatPackIDs(
            inventory,
            developmentBuild,
          );
          setUnlockedChatPackIDs(unlocked);
          setActiveChatPackIDs(
            loadSavedChatPacks(window.localStorage, unlocked),
          );
        })
        .catch(() => {
          if (disposed) return;
          setActiveChatPackIDs(
            loadSavedChatPacks(
              window.localStorage,
              INITIAL_UNLOCKED_CHAT_PACK_IDS,
            ),
          );
        });
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
        transport: createPersistentLoungeTransport(
          join.credentialProvider,
          updateConnectionState,
        ),
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
        hideDisabledAvatars: false,
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
        if (state === "reconnecting") {
          updateConnectionState("reconnecting");
        }
        if (state === "active" || state === "backgrounded") {
          updateConnectionState("online");
        }
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
      optimisticItemMoves.clear();
      optimisticItemTransforms.clear();
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
        selectedItem.defaultScale ?? 1,
        idempotencyKey,
      );
      setRemainingPlacements(reservation.remaining);
      const outcome = await runtime.spawnItem(
        selectedItem.definitionId,
        reservation.position,
        0,
        reservation.scale,
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

  const queueItemMutation = (
    item: LoungeEditableItem,
    kind: TeamLoungeItemMutationKind,
    transform: TeamLoungeItemTransform | null,
  ) => {
    mutationLabelsRef.current.set(item.entityID, item.label);
    mutationQueueRef.current?.enqueue(item, kind, transform);
    setDragState(null);
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
        {settingsContainer
          ? createPortal(
              <LoungeChatSettings
                activePackIDs={activeChatPackIDs}
                unlockedPackIDs={unlockedChatPackIDs}
                onChange={(packIDs) => {
                  setActiveChatPackIDs(packIDs);
                  saveLoungeChatPackIDs(
                    window.localStorage,
                    packIDs,
                    unlockedChatPackIDs,
                  );
                }}
              />,
              settingsContainer,
            )
          : null}
        {overlays.map(({ player, position, current, state }) => (
          <div
            className="team-lounge__shared-avatar"
            data-current={current || undefined}
            data-presence={state}
            data-avatar-stack={
              current ? "local" : state === "active" ? "teammate" : "bench"
            }
            data-hammock-occupied={
              itemOverlays.some(
                ({ hammockOccupantID }) =>
                  hammockOccupantID === `avatar:${player.id}`,
              ) || undefined
            }
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
              zIndex:
                state === "bench"
                  ? LoungeVisualLayer.BENCH_AVATAR
                  : current
                    ? 31
                    : LoungeVisualLayer.AVATAR,
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
            <div
              className={`team-lounge__avatar-decoration${
                state === "bench"
                  ? " team-lounge__avatar-decoration--bench"
                  : ""
              }`}
              aria-hidden="true"
            >
              <AvatarArt
                config={
                  current
                    ? avatarConfig
                    : normalizeAvatar(player.avatarConfiguration ?? {})
                }
              />
            </div>
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
          paintArtwork
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
            queueItemMutation(item, "transform", {
              ...item.transform,
              ...target,
            });
          }}
          onRotate={(item, rotation) =>
            queueItemMutation(item, "rotation", {
              ...item.transform,
              rotation,
            })
          }
          onScale={(item, scale) =>
            queueItemMutation(item, "scale", { ...item.transform, scale })
          }
          onDelete={(item) => queueItemMutation(item, "delete", null)}
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
          key={connectionState}
          choices={choices}
          selectedItem={selectedItem}
          remaining={remainingPlacements}
          capacity={placementCapacity}
          placing={placing}
          reactionLocked={reactionLocked}
          connectionState={connectionState}
          activePackIDs={activeChatPackIDs}
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
