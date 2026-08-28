"use client";

import { useEffect, useRef, useState, type MouseEvent } from "react";
import type {
  CanvasRuntime,
  OverlayEntityProjection,
  ParticipantPresence,
} from "@canvas-physics/client";
import { TransientActionRejectCode } from "@canvas-physics/protocol";

import { PlayerAvatar } from "../components/PlayerAvatar";
import { copy } from "../content/copy";
import { createPrizeBoxGateway } from "../data/prize-box-gateway";
import type { Player } from "../domain/types";
import type { LoungeCanvasState } from "./LocalLoungeCanvas";
import { LoungeActionDock } from "./LoungeActionDock";
import { loungeBallEntityID, publishLoungeBallPosition } from "./ball-position";
import {
  LOUNGE_EMOTE_COOLDOWN_MS,
  LOUNGE_EMOTE_DURATION_MS,
  loungeEmotes,
  type LoungeEmote,
} from "./lounge-emotes";
import {
  includedLoungeItems,
  loungeItemChoices,
  loungeItemDefinitions,
  loungeItemForDefinition,
  type LoungeItemChoice,
} from "./lounge-items";
import {
  prepareTeamLoungeJoin,
  reserveTeamLoungePlacement,
} from "./lounge-gateway";
import { beachBoardwalkAssets } from "./scene/assets";
import { beachBoardwalkDefinitions } from "./scene/beach-boardwalk";

interface AvatarOverlay {
  player: Player;
  position: { x: number; y: number };
  current: boolean;
}

interface ItemOverlay {
  entityID: string;
  item: LoungeItemChoice;
  position: { x: number; y: number };
  rotation: number;
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
  const [overlays, setOverlays] = useState<AvatarOverlay[]>([]);
  const [itemOverlays, setItemOverlays] = useState<ItemOverlay[]>([]);
  const [choices, setChoices] =
    useState<LoungeItemChoice[]>(includedLoungeItems);
  const [visitorIDs, setVisitorIDs] = useState<readonly string[]>([]);
  const [selectedItem, setSelectedItem] = useState<LoungeItemChoice | null>(
    null,
  );
  const [remainingPlacements, setRemainingPlacements] = useState(0);
  const [placing, setPlacing] = useState(false);
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
    let unsubscribePresence: () => void = () => undefined;
    let unsubscribeProjection: () => void = () => undefined;
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
    };

    onStateChange("loading");
    void (async () => {
      const join = await prepareTeamLoungeJoin(teamID);
      if (disposed) return;
      roomIDRef.current = join.roomID;
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
      unsubscribeProjection = runtime.subscribeOverlayProjection(
        ({ entities }) => {
          projections = entities;
          const ball = entities.find(
            ({ entityId }) => entityId === loungeBallEntityID,
          );
          publishLoungeBallPosition(
            mount,
            ball ? { ...ball.world, rotation: ball.rotation } : undefined,
          );
          publishOverlays();
          setItemOverlays(
            entities.flatMap((entity) => {
              const item = loungeItemForDefinition(entity.definitionId);
              return item?.glyph && entity.inViewport
                ? [
                    {
                      entityID: entity.entityId,
                      item,
                      position: entity.screen,
                      rotation: entity.rotation,
                    },
                  ]
                : [];
            }),
          );
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
      unsubscribeLifecycle();
      unsubscribeEffects();
      const active = runtime;
      runtime = undefined;
      runtimeRef.current = null;
      roomIDRef.current = "";
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

  const remaining = remainingPlacements;

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
      {itemOverlays.map(({ entityID, item, position, rotation }) => (
        <span
          key={entityID}
          className="team-lounge__placed-item"
          role="img"
          aria-label={`${item.label} stamp`}
          style={{
            transform: `translate3d(${position.x}px, ${position.y}px, 0) translate(-50%, -50%) rotate(${rotation}rad)`,
          }}
        >
          {item.glyph}
        </span>
      ))}
      {visitorIDs.flatMap((visitorID, index) => {
        if (overlays.some(({ player }) => player.id === visitorID)) return [];
        const visitor = roster.find(({ id }) => id === visitorID);
        const anchor = visitorAnchors[index];
        return visitor && anchor ? (
          <div
            key={`visitor:${visitorID}`}
            className="team-lounge__visitor-trace"
            aria-label={`${visitor.firstName} visited this week`}
            style={{ left: `${anchor.x}%`, top: `${(anchor.y / 150) * 100}%` }}
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
          disabled={placing || remaining === 0}
          onClick={placeItem}
        >
          <span>{copy.teamLounge.actions.placeHint(selectedItem.label)}</span>
          <b aria-hidden="true">{selectedItem.glyph}</b>
        </button>
      ) : null}
      <LoungeActionDock
        choices={choices}
        selectedItem={selectedItem}
        remaining={remaining}
        placing={placing}
        emoteLocked={emoteLocked}
        onSelectItem={setSelectedItem}
        onSendEmote={showEmote}
      />
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
