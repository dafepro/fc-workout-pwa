"use client";

import { useEffect, useRef, useState, type MouseEvent } from "react";
import type {
  CanvasRuntime,
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
import { loungeBallEntityID, publishLoungeBallPosition } from "./ball-position";
import { loungeWorldPoint } from "./lounge-editor-geometry";
import {
  LOUNGE_EMOTE_COOLDOWN_MS,
  LOUNGE_EMOTE_DURATION_MS,
  loungeEmotes,
  type LoungeEmote,
} from "./lounge-emotes";
import { performLoungeItemMutation } from "./lounge-item-mutations";
import {
  includedLoungeItems,
  loungeItemChoices,
  loungeItemDefinitions,
  loungeItemForDefinition,
  type LoungeItemChoice,
} from "./lounge-items";
import {
  prepareTeamLoungeJoin,
  requestTeamLoungeItemMutationPermit,
  reserveTeamLoungePlacement,
  type TeamLoungeItemMutationKind,
  type TeamLoungeItemTransform,
} from "./lounge-gateway";
import { beachBoardwalkAssets } from "./scene/assets";
import { beachBoardwalkDefinitions } from "./scene/beach-boardwalk";

interface AvatarOverlay {
  player: Player;
  position: { x: number; y: number };
  current: boolean;
}

const visitorAnchors = [
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
}: {
  teamID: string;
  playerID: string;
  roster: readonly Player[];
  onStateChange(state: LoungeCanvasState): void;
  onPresenceChange(count: number): void;
}) {
  const mountRef = useRef<HTMLDivElement>(null);
  const runtimeRef = useRef<CanvasRuntime | null>(null);
  const roomIDRef = useRef("");
  const rosterRef = useRef(roster);
  const editableItemIDsRef = useRef(new Set<string>());
  const projectionFrameRef = useRef<
    Pick<OverlayProjectionSnapshot, "canvasSize" | "viewport"> | undefined
  >(undefined);
  const trashTargetRef = useRef<HTMLDivElement>(null);
  const [overlays, setOverlays] = useState<AvatarOverlay[]>([]);
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
  const [activeEmote, setActiveEmote] = useState<{
    playerID: string;
    emote: LoungeEmote;
  } | null>(null);
  const [emoteLocked, setEmoteLocked] = useState(false);
  const emoteTimerRef = useRef<number | undefined>(undefined);
  const emoteCooldownTimerRef = useRef<number | undefined>(undefined);

  useEffect(() => {
    rosterRef.current = roster;
  }, [roster]);

  useEffect(
    () => () => {
      window.clearTimeout(emoteTimerRef.current);
      window.clearTimeout(emoteCooldownTimerRef.current);
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
    let unsubscribePresence: () => void = () => undefined;
    let unsubscribeProjection: () => void = () => undefined;
    let unsubscribeCanonical: () => void = () => undefined;
    let unsubscribeLifecycle: () => void = () => undefined;
    let unsubscribeEffects: () => void = () => undefined;

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
          return [
            {
              entityID: projection.entityId,
              label: item.label,
              glyph: item.glyph,
              category: item.kind === "lounge_prop" ? "item" : "stamp",
              editable:
                currentOwner &&
                editableItemIDsRef.current.has(projection.entityId),
              owner: currentOwner ? "current" : "teammate",
              itemRevision: canonical.itemRevision,
              screen: projection.screen,
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
        { kinds: ["avatar", "item"], maxEntities: 25, maxHz: 30 },
      );
      unsubscribeLifecycle = runtime.subscribeLifecycle(({ state }) => {
        if (state === "reconnecting") onStateChange("loading");
        if (state === "failed") onStateChange("error");
      });
      unsubscribeEffects = runtime.subscribeEffects((effect) => {
        if (effect.effect !== "zoomigo.emote") return;
        const emotePlayerID = effect.params?.playerId;
        const emoteID = effect.params?.emote;
        const received = loungeEmotes.find(({ id }) => id === emoteID);
        if (typeof emotePlayerID !== "string" || !received) return;
        setActiveEmote({ playerID: emotePlayerID, emote: received });
        window.clearTimeout(emoteTimerRef.current);
        emoteTimerRef.current = window.setTimeout(
          () => setActiveEmote(null),
          LOUNGE_EMOTE_DURATION_MS,
        );
      });
      await runtime.start({ until: "presented" });
      if (!disposed) onStateChange("ready");
    })().catch(() => !disposed && onStateChange("error"));

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
  }, [onPresenceChange, onStateChange, playerID, teamID]);

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
        setActionMessage(itemMutationRejectionMessage(outcome.status));
      }
    } catch (error) {
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

  const showEmote = async (next: LoungeEmote) => {
    const runtime = runtimeRef.current;
    if (!runtime || emoteLocked) return;
    setEmoteLocked(true);
    window.clearTimeout(emoteCooldownTimerRef.current);
    emoteCooldownTimerRef.current = window.setTimeout(
      () => setEmoteLocked(false),
      LOUNGE_EMOTE_COOLDOWN_MS,
    );
    try {
      const result = await runtime.submitTransientAction({
        action: "zoomigo.emote",
        target: "room",
        payload: { emote: next.id },
      }).result;
      setActionMessage(
        result.accepted
          ? `${next.label} sent.`
          : transientActionRejectionMessage(result.rejectCode),
      );
    } catch {
      setActionMessage("That reaction could not be sent.");
    }
  };

  const selectedEditableEntityID = itemOverlays.some(
    ({ entityID }) => entityID === selectedEntityID,
  )
    ? selectedEntityID
    : null;

  return (
    <>
      <div className="team-lounge__playfield">
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
            {activeEmote?.playerID === player.id ? (
              <b
                className="team-lounge__avatar-emote"
                role="img"
                aria-label={activeEmote.emote.label}
              >
                {activeEmote.emote.symbol}
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
            const mount = mountRef.current;
            const frame = projectionFrameRef.current;
            if (!mount || !frame) return;
            const bounds = mount.getBoundingClientRect();
            const target = loungeWorldPoint(
              { x: screen.x - bounds.left, y: screen.y - bounds.top },
              frame.viewport,
              frame.canvasSize,
            );
            if (!target) {
              setActionMessage("Keep that item inside the Lounge.");
              return;
            }
            void mutateItem(item, "transform", {
              ...item.transform,
              ...target,
            });
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
            aria-label={`Place ${selectedItem.label} stamp on the boardwalk`}
            disabled={placing || remainingPlacements === 0}
            onClick={placeItem}
          >
            <span>{copy.teamLounge.actions.placeHint(selectedItem.label)}</span>
            <b aria-hidden="true">{selectedItem.glyph}</b>
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
          emoteLocked={emoteLocked}
          onSelectItem={(item) => {
            setSelectedEntityID(null);
            setSelectedItem(item);
          }}
          onSendEmote={showEmote}
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
