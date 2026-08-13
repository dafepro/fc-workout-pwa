"use client";

import { consoleCopy } from "./console/copy";
import { ConsoleChrome, ConsoleNotice } from "./console/ConsoleChrome";
import { ConsoleRowLink } from "./console/ConsoleRowLink";
import { useResource } from "./console/useResource";
import { routes } from "../content/routes";
import type { TeamSummary } from "./console/types";

/** The coach's door: every team they're assigned to today, each one opening
 * onto its roster and assignment screen (F-C1). */
export function CoachHome({ email }: { email: string }) {
  const teams = useResource<{ teams: TeamSummary[] }>("v1/staff/teams");

  return (
    <ConsoleChrome title={consoleCopy.home.coachTitle}>
      <p className="console__who">{consoleCopy.home.signedInAs(email)}</p>
      <p>{consoleCopy.home.coachBody}</p>
      <section className="console-card" aria-label={consoleCopy.home.teams}>
        <h2 className="console-card__title">{consoleCopy.home.teams}</h2>
        {teams.error ? <ConsoleNotice message={teams.error} /> : null}
        {teams.loading ? <p>{consoleCopy.loading}</p> : null}
        {teams.data && teams.data.teams.length === 0 ? (
          <p>{consoleCopy.home.noTeams}</p>
        ) : null}
        <ul className="console-list">
          {(teams.data?.teams ?? []).map((team) => (
            <ConsoleRowLink
              key={team.id}
              href={routes.staffTeam(team.id)}
              name={team.name}
            >
              <span>{team.clubName}</span>
              <span>{consoleCopy.teams.playerCount(team.playerCount)}</span>
              <span>{team.timeZone}</span>
            </ConsoleRowLink>
          ))}
        </ul>
      </section>
      <p className="console-hint">{consoleCopy.signOutHint}</p>
    </ConsoleChrome>
  );
}
