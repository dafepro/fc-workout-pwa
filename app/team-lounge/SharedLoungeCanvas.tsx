"use client";

import { useEffect, useRef, useState, type MouseEvent } from "react";
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
import { copy } from "../content/copy";
import { createPrizeBoxGateway } from "../data/prize-box-gateway";
import type { Player } from "../domain/types";
import type { LoungeCanvasState } from "./LocalLoungeCanvas";
import { LoungeActionDock } from "./LoungeActionDock";
import { LoungeItemEditor, type LoungeEditableItem } from "./LoungeItemEditor";
import { LoungeItemArt } from "./LoungeItemArt";
import { loungeBallEntityID, publishLoungeBallPosition } from "./ball-position";
import { loungeWorldPoint } from "./lounge-editor-geometry";
import { createLoungeBackgroundScroll } from "./lounge-background-scroll";
import {
  LOUNGE_REACTION_COOLDOWN_MS,
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
  prepareTeamLoungeJoin,
  requestTeamLoungeItemMutationPermit,
  reserveTeamLoungePlacement,
  type TeamLoungeItemMutationKind,
  type TeamLoungeItemTransform,
} from "./lounge-gateway";
import { beachBoardwalkAssets } from "./scene/assets";
import {
  beachBoardwalkCanvas,
  beachBoardwalkDefinitions,
} from "./scene/beach-boardwalk";

const visitorAnchors = [
  { x: 8, y: 74 },
  { x: 74, y: 81 },
  { x: 48, y: 125 },
] as const;

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
  const [reactionLocked, setReactionLocked] = useState(false);
  const reactionTimerRef = useRef<number | undefined>(undefined);
  const reactionCooldownTimerRef = useRef<number | undefined>(undefined);
  const reactionSequenceRef = useRef(0);

  useEffect(() => {
    rosterRef.current = roster;
  }, [roster]);

  useEffect(() => {
    playerRef.current = player;
  }, [player]);

  useEffect(
    () => () => {
      window.clearTimeout(reactionTimerRef.current);
      window.clearTimeout(reactionCooldownTimerRef.current);
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
    let unsubscribePresence: () => void = () => undefined;
    let unsubscribeProjection: () => void = () => undefined;
    let unsubscribeCanonical: () => void = () => undefined;
    let unsubscribeLifecycle: () => void = () => undefined;
    let unsubscribeEffects: () => void = () => undefined;

    const failCanvas = (cause: unknown) => {
      if (disposed) return;
      console.error("The Lounge Canvas failed.", cause);
      onStateChange("error");
    };

    const publishOverlays = () => {
      if (disposed) return;
      const localAvatarEntityID = `avatar:${playerID}`;
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
              category: item.kind === "lounge_prop" ? "item" : "stamp",
              editable:
                currentOwner &&
                editableItemIDsRef.current.has(projection.entityId),
              owner: currentOwner ? "current" : "teammate",
              itemRevision: canonical.itemRevision,
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
      const join = await prepareTeamLoungeJoin(teamID);
      if (disposed) return;
      roomIDRef.current = join.roomID;
      editableItemIDsRef.current = new Set(join.editableItemIDs);
      setRemainingPlacements(join.placementCredits);
      setVisitorIDs(join.visitorIDs);
      const definitions = [
        ...beachBoardwalkDefinitions,
        ...loungeItemDefinitions,
      ];
      void createPrizeBoxGateway(true)
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
        definitions,
        assets,
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
        pointerInteractions: [createLoungeBackgroundScroll()],
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
        { kinds: ["avatar", "item"], maxEntities: 200, maxHz: 30 },
      );
      unsubscribeLifecycle = runtime.subscribeLifecycle(({ state }) => {
        if (state === "reconnecting") onStateChange("loading");
        if (state === "failed") onStateChange("error");
      });
      unsubscribeEffects = runtime.subscribeEffects((effect) => {
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
      const active = runtime;
      runtime = undefined;
      runtimeRef.current = null;
      roomIDRef.current = "";
      projectionFrameRef.current = undefined;
      if (active) void active.stopGracefully(500).catch(() => active.stop());
    };
  }, [assets, onPresenceChange, onStateChange, playerID, teamID]);

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
      const reservation = await reserveTeamLoungePlacement(
        teamID,
        roomID,
        selectedItem.definitionId,
        selectedItem.definitionVersion,
        point,
        crypto.randomUUID(),
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
        error instanceof Error
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
      const outcome = await performLoungeItemMutation({
        runtime,
        requestPermit: requestTeamLoungeItemMutationPermit,
        teamID,
        roomID,
        item,
        kind,
        transform,
        idempotencyKey: crypto.randomUUID(),
      });
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
                    transform: transform ?? currentItem.transform,
                  }
                : currentItem,
            ),
          );
          setActionMessage(`${item.label} updated.`);
        }
      } else {
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
    window.clearTimeout(reactionCooldownTimerRef.current);
    reactionCooldownTimerRef.current = window.setTimeout(
      () => setReactionLocked(false),
      LOUNGE_REACTION_COOLDOWN_MS,
    );
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
      <span className="visually-hidden" role="status">
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
