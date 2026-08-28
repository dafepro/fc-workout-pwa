"use client";

import { useCallback, useState } from "react";

import { copy } from "../content/copy";
import { LocalLoungeCanvas, type LoungeCanvasState } from "./LocalLoungeCanvas";

export function TeamLounge({ playerID }: { playerID: string }) {
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
          {copy.teamLounge.here}
        </span>
      </header>
      <div className="team-lounge__world" data-canvas-state={state}>
        <LocalLoungeCanvas playerID={playerID} onStateChange={updateState} />
        {state === "error" ? (
          <p className="team-lounge__status" role="alert">
            {copy.teamLounge.unavailable}
          </p>
        ) : (
          <p className="team-lounge__status" aria-live="polite">
            {state === "loading"
              ? copy.teamLounge.loading
              : state === "static"
                ? copy.teamLounge.static
                : copy.teamLounge.ready}
          </p>
        )}
      </div>
    </section>
  );
}
