"use client";

import { momentumAlphaCopy } from "../content";
import { useMomentumAlpha } from "../state";
import { MomentumTrail } from "./MomentumTrail";

export function MomentumTeam() {
  const { teamName, recentPlanFollowers, highlightedPlayers, loading } =
    useMomentumAlpha();

  if (loading) {
    return (
      <main className="ma-page ma-focused-page" aria-busy="true">
        <p>{momentumAlphaCopy.connected.loadingTeam}</p>
      </main>
    );
  }

  return (
    <div className="ma-page ma-team">
      <header className="ma-page-heading">
        <p className="ma-eyebrow">{momentumAlphaCopy.team.eyebrow}</p>
        <h1>{momentumAlphaCopy.connected.teamTitle(teamName)}</h1>
      </header>

      <MomentumTrail kind="team" band="building" />

      <section className="ma-team__pulse" aria-labelledby="ma-team-pulse-title">
        <div className="ma-team__pulse-mark" aria-hidden="true">
          ◌
        </div>
        <div>
          <h2 id="ma-team-pulse-title">{momentumAlphaCopy.team.pulseTitle}</h2>
          <p>{momentumAlphaCopy.team.followers(recentPlanFollowers)}</p>
        </div>
      </section>

      {highlightedPlayers.length > 0 ? (
        <section
          className="ma-highlights"
          aria-labelledby="ma-highlights-title"
        >
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
            {highlightedPlayers.map((player, index) => (
              <li key={player}>
                <span aria-hidden="true">{player.slice(0, 1)}</span>
                <strong>{player}</strong>
                <small>{momentumAlphaCopy.team.playerRhythms[index % 2]}</small>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <p className="ma-private-note ma-team__privacy">
        <span aria-hidden="true">◇</span> {momentumAlphaCopy.team.privacy}
      </p>
    </div>
  );
}
