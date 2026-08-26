"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import type { RuntimeDiagnostics } from "@canvas-physics/client";
import { defaultAvatar } from "../avatar/config";
import type {
  TeamCanvasStampUnlockPort,
  TeamCanvasWidgetContract,
} from "../player/team-canvas/widget-contract";
import type { StampAsset } from "../team-canvas/model";
import { defaultLoungeTheme, teamLoungeV2Copy as copy } from "./content";
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
  type StampPlacementChoice,
  type StampPlacementStatus,
} from "./controls/StampPlacementTray";
import { loungeStampAsset, loungeStampChoices } from "./placement/catalog";
import type { LoungePlaceableStamp } from "./data/lounge-gateway";
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
  const [stampDragState, setStampDragState] = useState<{
    entityID: string;
    overTrash: boolean;
  } | null>(null);
  const [stampDeleteError, setStampDeleteError] = useState<string | null>(null);
  const [placeableStamps, setPlaceableStamps] = useState<
    LoungePlaceableStamp[] | null
  >(null);
  const [theme, setTheme] = useState(defaultLoungeTheme);
  const placedStampCountRef = useRef(0);
  const signalPortRef = useRef<((kind: string) => void) | null>(null);
  const cooldownTimerRef = useRef<number | null>(null);
  const localEmoteTimerRef = useRef<number | null>(null);
  const stampTrashTargetRef = useRef<HTMLDivElement>(null);
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
  const stampChoices = useMemo<StampPlacementChoice[]>(() => {
    if (!sharedRoom) {
      return loungeStampChoices(
        stampUnlocks?.choices ?? host.inventory.choices,
      ).map((asset) => ({ asset, source: "included", isNew: false }));
    }
    return (placeableStamps ?? []).flatMap((stamp) => {
      const asset = loungeStampAsset(stamp.assetId);
      return asset ? [{ asset, source: stamp.source, isNew: stamp.isNew }] : [];
    });
  }, [
    host.inventory.choices,
    placeableStamps,
    sharedRoom,
    stampUnlocks?.choices,
  ]);
  const updatePlaceableStamps = useCallback(
    (stamps: LoungePlaceableStamp[]) => setPlaceableStamps(stamps),
    [],
  );
  const placementStatus: StampPlacementStatus = placementPending
    ? "placing"
    : !sharedRoom
      ? "local"
      : placeableStamps === null || placementSummary === null
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

  useEffect(() => {
    if (tray !== "stamps") return;
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setTray(null);
    };
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, [tray]);

  return (
    <section
      className="team-lounge-v2"
      role="region"
      aria-label={copy.regionLabel(theme.name)}
    >
      <header className="team-lounge-v2__header">
        <div>
          <p>{copy.label}</p>
          <h1>
            <span>This week</span>
            {theme.name}
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
            stampEditingEnabled
            onStampEditStart={() => setSelectedStamp(null)}
            onPlacementSummaryChange={(summary) => {
              if (summary.used > placedStampCountRef.current) {
                setSelectedStamp(null);
              }
              placedStampCountRef.current = summary.used;
              setPlacementSummary(summary);
              setPlacementError(null);
            }}
            onPlacementError={(reason) => {
              if (stampDragState) {
                if (reason !== "stamp_invalid_placement") {
                  setStampDeleteError(
                    copy.placementErrors[reason] ?? copy.deleteStampError,
                  );
                }
                return;
              }
              if (reason === "stamp_unavailable") setSelectedStamp(null);
              setPlacementError(
                copy.placementErrors[reason] ?? copy.placementError,
              );
              setTray("stamps");
            }}
            onPlacementPendingChange={setPlacementPending}
            onPlaceableStampsChange={updatePlaceableStamps}
            onThemeChange={setTheme}
            stampTrashTargetRef={stampTrashTargetRef}
            onStampDragStateChange={(state) => {
              if (state) {
                setTray(null);
                setStampDeleteError(null);
              }
              setStampDragState(state);
            }}
            onStampDeleteError={(reason) => {
              setStampDeleteError(
                copy.placementErrors[reason] ?? copy.deleteStampError,
              );
            }}
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
        {tray === "stamps" ? (
          <LoungeMenuOverlay
            title={copy.stamps}
            dialogLabel="Choose a stamp to place"
            closeLabel={copy.closeStamps}
            onClose={() => setTray(null)}
          >
            <StampPlacementTray
              choices={stampChoices}
              selected={selectedStamp}
              summary={placementSummary}
              status={placementStatus}
              error={placementError}
              onSelect={(asset) => {
                setPlacementError(null);
                setSelectedStamp(asset);
                setTray(null);
              }}
            />
          </LoungeMenuOverlay>
        ) : null}
      </div>

      {stampDragState ? (
        <div
          ref={stampTrashTargetRef}
          className="team-lounge-v2__trash-target"
          data-active={stampDragState.overTrash || undefined}
          data-canvas-pointer-ignore="true"
          role="status"
          aria-label={copy.deleteStampAria}
        >
          <span aria-hidden="true">⌫</span>
          <strong>
            {stampDragState.overTrash
              ? copy.deleteStampRelease
              : copy.deleteStampDrop}
          </strong>
          <small>{copy.deleteStampHint}</small>
        </div>
      ) : (
        <nav className="team-lounge-v2__actions" aria-label="Lounge actions">
          {tray === "emotes" ? (
            <div
              className="team-lounge-v2__emote-popover"
              aria-label="Choose an emote"
            >
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
          ) : null}
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
              if (tray === "stamps") {
                setTray(null);
                return;
              }
              if (placeableStamps?.some(({ isNew }) => isNew)) {
                setPlaceableStamps(
                  (current) =>
                    current?.map((stamp) => ({ ...stamp, isNew: false })) ??
                    null,
                );
                void Promise.resolve(stampUnlocks?.viewNew?.()).catch(
                  () => undefined,
                );
              }
              setTray("stamps");
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
      )}
      {stampDeleteError ? (
        <p className="team-lounge-v2__action-error" role="alert">
          {stampDeleteError}
        </p>
      ) : null}
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

function LoungeMenuOverlay({
  title,
  dialogLabel,
  closeLabel,
  onClose,
  children,
}: {
  title: string;
  dialogLabel: string;
  closeLabel: string;
  onClose(): void;
  children: ReactNode;
}) {
  return (
    <div className="team-lounge-v2__menu-overlay">
      <button
        className="team-lounge-v2__menu-backdrop"
        type="button"
        aria-hidden="true"
        tabIndex={-1}
        onClick={onClose}
      />
      <section
        className="team-lounge-v2__menu-sheet"
        role="dialog"
        aria-label={dialogLabel}
      >
        <header>
          <strong>{title}</strong>
          <button type="button" aria-label={closeLabel} onClick={onClose}>
            ×
          </button>
        </header>
        {children}
      </section>
    </div>
  );
}
