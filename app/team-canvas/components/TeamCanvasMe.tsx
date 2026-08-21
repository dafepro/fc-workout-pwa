"use client";

import { useState } from "react";
import { AppViewSelect } from "../../components/AppViewSelect";
import { PlayerAvatar } from "../../components/PlayerAvatar";
import { teamCanvasCopy } from "../content";
import { teamCanvasMock } from "../mock-data";
import type { ExtraActivity } from "../model";
import { useTeamCanvas } from "../state";

export function TeamCanvasMe({
  showReviewControls = false,
}: {
  showReviewControls?: boolean;
}) {
  const { state, recordExtra, previewDay, reset } = useTeamCanvas();
  const [extra, setExtra] = useState<ExtraActivity>("ball-touches");
  const content = teamCanvasCopy.me;
  const player = teamCanvasMock.player;

  return (
    <div className="tc-me">
      <header className="tc-profile">
        <PlayerAvatar player={player} size="large" emphasizeSelf={false} />
        <div>
          <p className="tc-eyebrow">{content.eyebrow}</p>
          <h1>
            {player.firstName} {player.lastInitial}
          </h1>
          <p>{teamCanvasMock.team.name}</p>
        </div>
      </header>

      <AppViewSelect currentView="team-canvas" />

      <section className="tc-private" aria-labelledby="tc-history-title">
        <p className="tc-eyebrow">Only you and authorized adults</p>
        <h2 id="tc-history-title">{content.historyTitle}</h2>
        {state.history.length === 0 ? (
          <p>{content.historyEmpty}</p>
        ) : (
          <ul>
            {[...state.history].reverse().map((entry) => (
              <li key={entry.id}>
                <span aria-hidden="true">
                  {entry.kind === "rest" ? "☾" : "✓"}
                </span>
                <div>
                  <strong>{entry.title}</strong>
                  <small>{entry.detail}</small>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="tc-extra" aria-labelledby="tc-extra-title">
        <h2 id="tc-extra-title">{content.extraTitle}</h2>
        <label>
          <span>{content.extraLabel}</span>
          <select
            value={extra}
            onChange={(event) => setExtra(event.target.value as ExtraActivity)}
          >
            {teamCanvasMock.extras.map((activity) => (
              <option key={activity.id} value={activity.id}>
                {activity.label}
              </option>
            ))}
          </select>
        </label>
        <button type="button" onClick={() => recordExtra(extra)}>
          {content.extraSave}
        </button>
        <p>
          Extras stay private and do not add stars, unlock Team, or earn stamps.
        </p>
      </section>

      {showReviewControls ? (
        <section className="tc-review" aria-labelledby="tc-review-title">
          <h2 id="tc-review-title">{content.reviewTitle}</h2>
          <p>{content.reviewBody}</p>
          <div>
            <button type="button" onClick={() => previewDay("training")}>
              {content.trainingDay}
            </button>
            <button type="button" onClick={() => previewDay("rest")}>
              {content.restDay}
            </button>
            <button type="button" onClick={reset}>
              {content.reset}
            </button>
          </div>
        </section>
      ) : null}
    </div>
  );
}
