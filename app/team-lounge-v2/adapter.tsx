"use client";

import { useCallback, useEffect, useState } from "react";
import type {
  TeamCanvasStampUnlockPort,
  TeamCanvasWidgetContract,
} from "../player/team-canvas/widget-contract";
import { teamLoungeV2Copy as copy } from "./content";
import {
  LocalLoungeCanvas,
  type LocalLoungeCanvasState,
} from "./LocalLoungeCanvas";
import { SharedLoungeCanvas } from "./SharedLoungeCanvas";

export function TeamLoungeV2({
  host,
  stampUnlocks,
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
  const [activeEmote, setActiveEmote] = useState<string | null>(null);
  const updateRuntimeState = useCallback(
    (next: LocalLoungeCanvasState) => setRuntimeState(next),
    [],
  );
  const updatePresence = useCallback(
    (next: number) => setPresenceCount(Math.max(0, next)),
    [],
  );
  const sharedRoom =
    host.access.state === "ready" &&
    host.identity.teamID.length > 0 &&
    host.identity.playerID !== "player";
  const stampCount =
    stampUnlocks?.choices.length ?? host.inventory.choices.length;

  useEffect(() => {
    if (!activeEmote) {
      return;
    }

    const timeout = window.setTimeout(() => setActiveEmote(null), 2400);
    return () => window.clearTimeout(timeout);
  }, [activeEmote]);

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
            reducedMotion={host.lifecycle.reducedMotion}
            onStateChange={updateRuntimeState}
            onPresenceChange={updatePresence}
          />
        ) : (
          <LocalLoungeCanvas
            key={`local-${runtimeKey}`}
            playerID={host.identity.playerID}
            reducedMotion={host.lifecycle.reducedMotion}
            onStateChange={updateRuntimeState}
          />
        )}
        {activeEmote ? (
          <span
            className="team-lounge-v2__active-emote"
            role="status"
            aria-label={`You sent ${activeEmote}`}
          >
            {activeEmote}
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
          {["👋", "❤️", "⚽", "⭐", "😂"].map((emote) => (
            <button
              key={emote}
              type="button"
              aria-label={`Send ${emote} emote`}
              onClick={() => {
                setActiveEmote(emote);
                setTray(null);
              }}
            >
              {emote}
            </button>
          ))}
        </div>
      ) : tray === "stamps" ? (
        <p className="team-lounge-v2__tray-note" role="status">
          {stampCount > 0
            ? `${stampCount} earned ${stampCount === 1 ? "stamp" : "stamps"} will connect in the placement slice.`
            : "No stamps are waiting to place."}
        </p>
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
          onClick={() =>
            setTray((current) => (current === "stamps" ? null : "stamps"))
          }
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
