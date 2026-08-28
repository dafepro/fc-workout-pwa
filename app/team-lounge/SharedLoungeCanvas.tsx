"use client";

import { useEffect, useRef, useState, type MouseEvent } from "react";
import type {
  CanvasRuntime,
  OverlayEntityProjection,
  ParticipantPresence,
} from "@canvas-physics/client";

import { PlayerAvatar } from "../components/PlayerAvatar";
import { createPrizeBoxGateway } from "../data/prize-box-gateway";
import type { Player } from "../domain/types";
import type { LoungeCanvasState } from "./LocalLoungeCanvas";
import { loungeBallEntityID, publishLoungeBallPosition } from "./ball-position";
import {
  LOUNGE_EMOTE_COOLDOWN_MS,
  LOUNGE_EMOTE_DURATION_MS,
  loungeEmotes,
  type LoungeEmote,
} from "./lounge-emotes";
import { loungeDevelopment, type LoungeItemChoice } from "#lounge-development";
import { prepareTeamLoungeJoin } from "./lounge-gateway";
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
  const rosterRef = useRef(roster);
  const [overlays, setOverlays] = useState<AvatarOverlay[]>([]);
  const [itemOverlays, setItemOverlays] = useState<ItemOverlay[]>([]);
  const [choices, setChoices] = useState<LoungeItemChoice[]>(
    loungeDevelopment.initialChoices,
  );
  const [visitorIDs, setVisitorIDs] = useState<readonly string[]>([]);
  const [selectedItem, setSelectedItem] = useState<LoungeItemChoice | null>(
    null,
  );
  const [placementCredits, setPlacementCredits] = useState(0);
  const [usedPlacements, setUsedPlacements] = useState(0);
  const [placing, setPlacing] = useState(false);
  const [actionMessage, setActionMessage] = useState("");
  const [emote, setEmote] = useState<LoungeEmote | null>(null);
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
    let unsubscribeCanonical: () => void = () => undefined;

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
      setPlacementCredits(join.placementCredits);
      setVisitorIDs(join.visitorIDs);
      let definitions = beachBoardwalkDefinitions;
      if (loungeDevelopment.enabled) {
        definitions = [...definitions, ...loungeDevelopment.itemDefinitions];
        void createPrizeBoxGateway(true)
          .inventory(["lounge_stamp", "lounge_prop"])
          .then((inventory) => {
            if (!disposed) {
              setChoices(loungeDevelopment.itemChoices(inventory));
            }
          })
          .catch(() => undefined);
      }
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
      unsubscribeCanonical = runtime.subscribeCanonicalState(({ entities }) => {
        const canonicalUsed = entities.filter(
          ({ kind, ownerUserId, definitionId }) =>
            kind === "item" &&
            ownerUserId === playerID &&
            Boolean(loungeDevelopment.itemForDefinition(definitionId)),
        ).length;
        setUsedPlacements((current) => Math.max(current, canonicalUsed));
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
              const item = loungeDevelopment.itemForDefinition(
                entity.definitionId,
              );
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
      await runtime.start({ until: "presented" });
      if (!disposed) onStateChange("ready");
    })().catch(() => !disposed && onStateChange("error"));

    return () => {
      disposed = true;
      unsubscribePresence();
      unsubscribeProjection();
      unsubscribeLifecycle();
      unsubscribeCanonical();
      const active = runtime;
      runtime = undefined;
      runtimeRef.current = null;
      if (active) void active.stopGracefully(500).catch(() => active.stop());
    };
  }, [onPresenceChange, onStateChange, playerID, teamID]);

  const placeItem = async (event: MouseEvent<HTMLButtonElement>) => {
    const runtime = runtimeRef.current;
    const mount = mountRef.current;
    if (!runtime || !mount || !selectedItem || placing) return;
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
    const outcome = await runtime.spawnItem(selectedItem.definitionId, point)
      .settled;
    setPlacing(false);
    if (outcome.status === "accepted") {
      setUsedPlacements((current) => Math.max(current, usedPlacements + 1));
      setActionMessage(`${selectedItem.label} placed.`);
      setSelectedItem(null);
    } else {
      setActionMessage("That item could not be placed.");
    }
  };

  const showEmote = (next: LoungeEmote) => {
    if (emoteLocked) return;
    setEmote(next);
    setEmoteLocked(true);
    setActionMessage(`${next.label} sent.`);
    window.clearTimeout(emoteTimerRef.current);
    window.clearTimeout(emoteCooldownTimerRef.current);
    emoteTimerRef.current = window.setTimeout(
      () => setEmote(null),
      LOUNGE_EMOTE_DURATION_MS,
    );
    emoteCooldownTimerRef.current = window.setTimeout(
      () => setEmoteLocked(false),
      LOUNGE_EMOTE_COOLDOWN_MS,
    );
  };

  const remaining = Math.max(0, placementCredits - usedPlacements);

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
          {current && emote ? (
            <b
              className="team-lounge__avatar-emote"
              role="img"
              aria-label={emote.label}
            >
              {emote.symbol}
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
      {loungeDevelopment.enabled && selectedItem ? (
        <button
          type="button"
          className="team-lounge__placement-surface"
          aria-label={`Place ${selectedItem.label} stamp on the boardwalk`}
          disabled={placing || remaining === 0}
          onClick={placeItem}
        >
          Tap where you want it
        </button>
      ) : null}
      {loungeDevelopment.enabled ? (
        <div className="team-lounge__actions" data-canvas-pointer-ignore="true">
          <div className="team-lounge__action-row" aria-label="Quick reactions">
            {loungeEmotes.map((choice) => (
              <button
                key={choice.label}
                type="button"
                aria-label={choice.label}
                disabled={emoteLocked}
                onClick={() => showEmote(choice)}
              >
                {choice.symbol}
              </button>
            ))}
          </div>
          <div
            className="team-lounge__action-row"
            aria-label={`Place a stamp, ${remaining} remaining`}
          >
            {choices.map((choice) => (
              <button
                key={choice.id}
                type="button"
                aria-label={`Choose ${choice.label} stamp`}
                aria-pressed={selectedItem?.id === choice.id}
                disabled={placing || remaining === 0}
                onClick={() =>
                  setSelectedItem((selected) =>
                    selected?.id === choice.id ? null : choice,
                  )
                }
              >
                {choice.glyph}
              </button>
            ))}
          </div>
          <span className="team-lounge__action-count">
            {remaining} item{remaining === 1 ? "" : "s"} left
          </span>
          <span className="visually-hidden" role="status">
            {actionMessage}
          </span>
        </div>
      ) : null}
    </>
  );
}
