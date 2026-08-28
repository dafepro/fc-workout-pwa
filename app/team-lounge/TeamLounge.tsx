"use client";

import { useCallback, useState } from "react";
import Link from "next/link";

import { copy } from "../content/copy";
import type { Player } from "../domain/types";
import { LocalLoungeCanvas, type LoungeCanvasState } from "./LocalLoungeCanvas";

export function TeamLounge({
  player,
  unlocked,
}: {
  player: Player;
  unlocked: boolean;
}) {
  const [state, setState] = useState<LoungeCanvasState>("loading");
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
          {unlocked ? copy.teamLounge.here : copy.teamLounge.locked}
        </span>
      </header>
      <div
        className={`team-lounge__world${unlocked ? "" : " team-lounge__world--locked"}`}
        data-canvas-state={unlocked ? state : "locked"}
      >
        {unlocked ? (
          <LocalLoungeCanvas player={player} onStateChange={updateState} />
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
          <p className="team-lounge__status" role="alert">
            {copy.teamLounge.unavailable}
          </p>
        ) : unlocked ? (
          <p className="team-lounge__status" aria-live="polite">
            {state === "loading"
              ? copy.teamLounge.loading
              : state === "static"
                ? copy.teamLounge.static
                : copy.teamLounge.ready}
          </p>
        ) : null}
      </div>
    </section>
  );
}
