"use client";

import { momentumAlphaCopy } from "../content";
import { teamMomentumProjection } from "../model";
import { useMomentumAlpha } from "../state";
import { MomentumTrail } from "./MomentumTrail";

export function MomentumTeam() {
  const { state } = useMomentumAlpha();
  const team = teamMomentumProjection(state);

  return (
    <div className="ma-page ma-team">
      <header className="ma-page-heading">
        <p className="ma-eyebrow">{momentumAlphaCopy.team.eyebrow}</p>
        <h1>{momentumAlphaCopy.team.title}</h1>
      </header>

      <MomentumTrail kind="team" band={team.band} />

      <section className="ma-team__pulse" aria-labelledby="ma-team-pulse-title">
        <div className="ma-team__pulse-mark" aria-hidden="true">
          ◌
        </div>
        <div>
          <h2 id="ma-team-pulse-title">{momentumAlphaCopy.team.pulseTitle}</h2>
          <p>{momentumAlphaCopy.team.followers(team.recentPlanFollowers)}</p>
        </div>
      </section>

      <section className="ma-highlights" aria-labelledby="ma-highlights-title">
        <div>
          <p className="ma-eyebrow">
            {momentumAlphaCopy.team.highlightEyebrow}
          </p>
          <h2 id="ma-highlights-title">
            {momentumAlphaCopy.team.highlightTitle}
          </h2>
          <p>{momentumAlphaCopy.team.highlightBody}</p>
        </div>
        <ul>
          {team.highlightedPlayers.map((player, index) => (
            <li key={player}>
              <span aria-hidden="true">{player.slice(0, 1)}</span>
              <strong>{player}</strong>
              <small>{momentumAlphaCopy.team.playerRhythms[index % 2]}</small>
            </li>
          ))}
        </ul>
      </section>

      <p className="ma-private-note ma-team__privacy">
        <span aria-hidden="true">◇</span> {momentumAlphaCopy.team.privacy}
      </p>
    </div>
  );
}
