"use client";

import { copy } from "../content/copy";
import { ConsoleChrome, ConsoleNotice } from "./console/ConsoleChrome";
import { useResource } from "./console/useResource";
import type { TeamSummary } from "./console/types";

/** Phase 3 builds the coach console proper. Until then a coach still needs a
 * door that tells them where they stand and, above all, a way to sign out. */
export function CoachHome({ email }: { email: string }) {
  const teams = useResource<{ teams: TeamSummary[] }>("v1/staff/teams");

  return (
    <ConsoleChrome title={copy.console.home.coachTitle}>
      <p className="console__who">{copy.console.home.signedInAs(email)}</p>
      <p>{copy.console.home.coachBody}</p>
      <section className="console-card" aria-label={copy.console.home.teams}>
        <h2 className="console-card__title">{copy.console.home.teams}</h2>
        {teams.error ? <ConsoleNotice message={teams.error} /> : null}
        {teams.loading ? <p>{copy.console.loading}</p> : null}
        {teams.data && teams.data.teams.length === 0 ? (
          <p>{copy.console.home.noTeams}</p>
        ) : null}
        <ul className="console-list">
          {(teams.data?.teams ?? []).map((team) => (
            <li key={team.id} className="console-list__row">
              <strong>{team.name}</strong>
              <span>{team.clubName}</span>
              <span>{copy.console.teams.playerCount(team.playerCount)}</span>
              <span>{team.timeZone}</span>
            </li>
          ))}
        </ul>
      </section>
      <p className="console-hint">{copy.console.signOutHint}</p>
    </ConsoleChrome>
  );
}
