"use client";

import { useCallback, useState } from "react";
import Link from "next/link";

import { copy } from "../content/copy";
import type { Player } from "../domain/types";
import { LocalLoungeCanvas, type LoungeCanvasState } from "./LocalLoungeCanvas";
import { SharedLoungeCanvas } from "./SharedLoungeCanvas";

export function TeamLounge({
  player,
  unlocked,
  connected = false,
  teamID = "team-hill-striders",
  roster = [player],
}: {
  player: Player;
  unlocked: boolean;
  connected?: boolean;
  teamID?: string;
  roster?: readonly Player[];
}) {
  const [state, setState] = useState<LoungeCanvasState>("loading");
  const [presence, setPresence] = useState(1);
  const [canvasKey, setCanvasKey] = useState(0);
  const updateState = useCallback(
    (next: LoungeCanvasState) => setState(next),
    [],
  );

  return (
    <section
      className="team-lounge"
      role="region"
      aria-label={copy.teamLounge.regionLabel}
    >
      <header className="team-lounge__header">
        <div>
          <p>{copy.teamLounge.label}</p>
          <h2>
            <span>{copy.teamLounge.period}</span>
            {copy.teamLounge.theme}
          </h2>
        </div>
        <span className="team-lounge__presence">
          <span aria-hidden="true" />
          {unlocked ? `${presence} here` : copy.teamLounge.locked}
        </span>
      </header>
      <div
        className={`team-lounge__world${unlocked ? "" : " team-lounge__world--locked"}`}
        data-canvas-state={unlocked ? state : "locked"}
      >
        {unlocked ? (
          connected ? (
            <SharedLoungeCanvas
              key={canvasKey}
              teamID={teamID}
              playerID={player.id}
              roster={roster}
              onStateChange={updateState}
              onPresenceChange={setPresence}
            />
          ) : (
            <LocalLoungeCanvas
              key={canvasKey}
              player={player}
              onStateChange={updateState}
            />
          )
        ) : (
          <div className="team-lounge__lock">
            <span className="team-lounge__lock-mark" aria-hidden="true">
              ◆
            </span>
            <h3>{copy.teamLounge.lockedTitle}</h3>
            <p>{copy.teamLounge.lockedDetail}</p>
            <Link href="/">{copy.teamLounge.lockedAction}</Link>
          </div>
        )}
        {unlocked && state === "error" ? (
          <div className="team-lounge__status" role="alert">
            <p>{copy.teamLounge.unavailable}</p>
            <button
              type="button"
              onClick={() => {
                setState("loading");
                setCanvasKey((key) => key + 1);
              }}
            >
              {copy.teamLounge.retry}
            </button>
          </div>
        ) : unlocked && state !== "ready" ? (
          <p className="team-lounge__status" aria-live="polite">
            {state === "loading"
              ? copy.teamLounge.loading
              : copy.teamLounge.static}
          </p>
        ) : null}
      </div>
    </section>
  );
}
