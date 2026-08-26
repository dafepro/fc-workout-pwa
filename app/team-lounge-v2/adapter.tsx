"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { RuntimeDiagnostics } from "@canvas-physics/client";
import { defaultAvatar } from "../avatar/config";
import type {
  TeamCanvasStampUnlockPort,
  TeamCanvasWidgetContract,
} from "../player/team-canvas/widget-contract";
import type { StampAsset } from "../team-canvas/model";
import { teamLoungeV2Copy as copy } from "./content";
import {
  LocalLoungeCanvas,
  type LocalLoungeCanvasState,
} from "./LocalLoungeCanvas";
import {
  SharedLoungeCanvas,
  type LoungePlacementSummary,
} from "./SharedLoungeCanvas";
import { CollisionDebugOverlay } from "./dev/CollisionDebugOverlay";
import { LoungeDevPanel } from "./dev/LoungeDevPanel";
import {
  StampPlacementTray,
  type StampPlacementStatus,
} from "./controls/StampPlacementTray";
import { loungeStampChoices } from "./placement/catalog";
import type { LoungeRosterMember } from "./presence";
import {
  LOUNGE_EMOTE_COOLDOWN_MS,
  LOUNGE_EMOTE_DURATION_MS,
  loungeEmotes,
} from "./social/emotes";

export function TeamLoungeV2({
  host,
  stampUnlocks,
  showDeveloperTools = false,
}: {
  host: TeamCanvasWidgetContract;
  showDeveloperTools?: boolean;
  todayHref?: string;
  stampUnlocks?: TeamCanvasStampUnlockPort;
}) {
  const [tray, setTray] = useState<"emotes" | "stamps" | null>(null);
  const [runtimeKey, setRuntimeKey] = useState(0);
  const [runtimeState, setRuntimeState] =
    useState<LocalLoungeCanvasState>("loading");
  const [presenceCount, setPresenceCount] = useState(1);
  const [diagnostics, setDiagnostics] = useState<RuntimeDiagnostics | null>(
    null,
  );
  const [showCollisionMap, setShowCollisionMap] = useState(false);
  const [signalReady, setSignalReady] = useState(false);
  const [emoteCoolingDown, setEmoteCoolingDown] = useState(false);
  const [localEmote, setLocalEmote] = useState<
    (typeof loungeEmotes)[number] | null
  >(null);
  const [selectedStamp, setSelectedStamp] = useState<StampAsset | null>(null);
  const [placementSummary, setPlacementSummary] =
    useState<LoungePlacementSummary | null>(null);
  const [placementError, setPlacementError] = useState<string | null>(null);
  const [placementPending, setPlacementPending] = useState(false);
  const placedStampCountRef = useRef(0);
  const signalPortRef = useRef<((kind: string) => void) | null>(null);
  const cooldownTimerRef = useRef<number | null>(null);
  const localEmoteTimerRef = useRef<number | null>(null);
  const updateRuntimeState = useCallback((next: LocalLoungeCanvasState) => {
    setRuntimeState(next);
    if (next === "loading") setDiagnostics(null);
  }, []);
  const updatePresence = useCallback(
    (next: number) => setPresenceCount(Math.max(0, next)),
    [],
  );
  const updateSignalPort = useCallback(
    (sender: ((kind: string) => void) | null) => {
      signalPortRef.current = sender;
      setSignalReady(sender !== null);
    },
    [],
  );
  const sharedRoom =
    host.access.state === "ready" &&
    host.identity.teamID.length > 0 &&
    host.identity.playerID !== "player";
  const stampChoices = useMemo(
    () => loungeStampChoices(stampUnlocks?.choices ?? host.inventory.choices),
    [host.inventory.choices, stampUnlocks?.choices],
  );
  const placementStatus: StampPlacementStatus = placementPending
    ? "placing"
    : !sharedRoom
      ? "local"
      : stampUnlocks?.status === "error"
        ? "error"
        : stampUnlocks?.status === "loading" || placementSummary === null
          ? "loading"
          : placementSummary.remaining === 0
            ? "exhausted"
            : "ready";
  const roster = useMemo<LoungeRosterMember[]>(() => {
    const members = (host.room.projection?.members ?? []).map((member) => ({
      playerID: member.player.id,
      displayName: `${member.player.firstName} ${member.player.lastInitial}`,
      avatarConfiguration:
        member.player.id === host.identity.playerID && host.identity.avatar
          ? host.identity.avatar
          : member.avatarConfiguration,
    }));
    if (!members.some(({ playerID }) => playerID === host.identity.playerID)) {
      members.push({
        playerID: host.identity.playerID,
        displayName: "You",
        avatarConfiguration: host.identity.avatar ?? defaultAvatar(),
      });
    }
    return members;
  }, [
    host.identity.avatar,
    host.identity.playerID,
    host.room.projection?.members,
  ]);

  useEffect(
    () => () => {
      if (cooldownTimerRef.current !== null) {
        window.clearTimeout(cooldownTimerRef.current);
      }
      if (localEmoteTimerRef.current !== null) {
        window.clearTimeout(localEmoteTimerRef.current);
      }
    },
    [],
  );

  return (
    <section
      className="team-lounge-v2"
      role="region"
      aria-label={copy.regionLabel}
    >
      <header className="team-lounge-v2__header">
        <div>
          <p>{copy.label}</p>
          <h1>
            <span>This week</span>
            {copy.theme}
          </h1>
        </div>
        <span
          className="team-lounge-v2__presence"
          aria-label={`${presenceCount} ${presenceCount === 1 ? "player" : "players"} here`}
        >
          <span aria-hidden="true" />
          {presenceCount} here
        </span>
      </header>

      <div className="team-lounge-v2__world" data-canvas-state={runtimeState}>
        <div className="team-lounge-v2__sky" aria-hidden="true">
          <span className="team-lounge-v2__sun" />
          <span className="team-lounge-v2__cloud team-lounge-v2__cloud--one" />
          <span className="team-lounge-v2__cloud team-lounge-v2__cloud--two" />
        </div>
        <div className="team-lounge-v2__shore" aria-hidden="true" />
        <div className="team-lounge-v2__boardwalk" aria-hidden="true" />
        {sharedRoom ? (
          <SharedLoungeCanvas
            key={`shared-${runtimeKey}`}
            teamID={host.identity.teamID}
            playerID={host.identity.playerID}
            roster={roster}
            onStateChange={updateRuntimeState}
            onPresenceChange={updatePresence}
            onSignalPortChange={updateSignalPort}
            onDiagnostics={showDeveloperTools ? setDiagnostics : undefined}
            selectedStamp={selectedStamp}
            stampEditingEnabled={tray === "stamps"}
            onPlacementSummaryChange={(summary) => {
              if (summary.used > placedStampCountRef.current) {
                setSelectedStamp(null);
              }
              placedStampCountRef.current = summary.used;
              setPlacementSummary(summary);
              setPlacementError(null);
            }}
            onPlacementError={(reason) => {
              setPlacementError(
                copy.placementErrors[reason] ?? copy.placementError,
              );
            }}
            onPlacementPendingChange={setPlacementPending}
          />
        ) : (
          <LocalLoungeCanvas
            key={`local-${runtimeKey}`}
            playerID={host.identity.playerID}
            onStateChange={updateRuntimeState}
          />
        )}
        {showDeveloperTools && showCollisionMap ? (
          <CollisionDebugOverlay />
        ) : null}
        {!sharedRoom && localEmote ? (
          <span
            className="team-lounge-v2__local-emote"
            role="status"
            aria-label={`You previewed ${localEmote.label}`}
          >
            {localEmote.symbol}
          </span>
        ) : null}
        {runtimeState === "error" ? (
          <div className="team-lounge-v2__runtime-error" role="alert">
            <strong>{copy.unavailable}</strong>
            <button
              type="button"
              onClick={() => setRuntimeKey((key) => key + 1)}
            >
              {copy.retry}
            </button>
          </div>
        ) : (
          <p className="team-lounge-v2__hint">
            {runtimeState === "loading"
              ? copy.loading
              : runtimeState === "reconnecting"
                ? copy.reconnecting
                : copy.ready}
          </p>
        )}
        <span className="team-lounge-v2__preview">
          {sharedRoom ? copy.shared : copy.preview}
        </span>
      </div>

      {tray === "emotes" ? (
        <div className="team-lounge-v2__tray" aria-label="Choose an emote">
          {loungeEmotes.map((emote) => (
            <button
              key={emote.kind}
              type="button"
              aria-label={`Send ${emote.label} emote`}
              disabled={(sharedRoom && !signalReady) || emoteCoolingDown}
              onClick={() => {
                const send = signalPortRef.current;
                if (emoteCoolingDown || (sharedRoom && !send)) return;
                if (sharedRoom) {
                  send?.(emote.kind);
                } else {
                  setLocalEmote(emote);
                  if (localEmoteTimerRef.current !== null) {
                    window.clearTimeout(localEmoteTimerRef.current);
                  }
                  localEmoteTimerRef.current = window.setTimeout(() => {
                    localEmoteTimerRef.current = null;
                    setLocalEmote(null);
                  }, LOUNGE_EMOTE_DURATION_MS);
                }
                setEmoteCoolingDown(true);
                if (cooldownTimerRef.current !== null) {
                  window.clearTimeout(cooldownTimerRef.current);
                }
                cooldownTimerRef.current = window.setTimeout(() => {
                  cooldownTimerRef.current = null;
                  setEmoteCoolingDown(false);
                }, LOUNGE_EMOTE_COOLDOWN_MS);
                setTray(null);
              }}
            >
              {emote.symbol}
            </button>
          ))}
        </div>
      ) : tray === "stamps" ? (
        <StampPlacementTray
          choices={stampChoices}
          selected={selectedStamp}
          summary={placementSummary}
          status={placementStatus}
          error={placementError}
          onSelect={(asset) => {
            setPlacementError(null);
            setSelectedStamp(asset);
          }}
        />
      ) : null}

      <nav className="team-lounge-v2__actions" aria-label="Lounge actions">
        <button
          type="button"
          aria-pressed={tray === "emotes"}
          onClick={() =>
            setTray((current) => (current === "emotes" ? null : "emotes"))
          }
        >
          <span aria-hidden="true">☺</span>
          {copy.emotes}
        </button>
        <button
          type="button"
          aria-pressed={tray === "stamps"}
          onClick={() => {
            setTray((current) => {
              if (current === "stamps") return null;
              void Promise.resolve(stampUnlocks?.viewNew?.()).catch(
                () => undefined,
              );
              return "stamps";
            });
          }}
        >
          <span aria-hidden="true">✦</span>
          {copy.stamps}
        </button>
        <button type="button" disabled aria-describedby="v2-items-hint">
          <span aria-hidden="true">▣</span>
          {copy.items}
        </button>
        <button type="button" disabled aria-describedby="v2-map-hint">
          <span aria-hidden="true">⌖</span>
          {copy.map}
        </button>
      </nav>
      {showDeveloperTools && sharedRoom ? (
        <LoungeDevPanel
          diagnostics={diagnostics}
          showCollisionMap={showCollisionMap}
          onShowCollisionMapChange={setShowCollisionMap}
        />
      ) : null}
      <div className="team-lounge-v2__disabled-hints">
        <span id="v2-items-hint">{copy.itemsHint}</span>
        <span id="v2-map-hint">{copy.mapHint}</span>
      </div>
      <p className="team-lounge-v2__local-hint">
        {sharedRoom ? copy.sharedHint : copy.localHint}
      </p>
    </section>
  );
}
