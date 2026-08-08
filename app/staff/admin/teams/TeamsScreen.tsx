"use client";

import { consoleCopy } from "../../console/copy";
import { useState } from "react";
import Link from "next/link";
import { routes } from "../../../content/routes";
import { ConsoleChrome, ConsoleNotice } from "../../console/ConsoleChrome";
import { useResource } from "../../console/useResource";
import type { ClubSummary, TeamSummary } from "../../console/types";
import { AdminNav } from "../AdminNav";
import { TeamForm } from "./TeamForm";

/** F-O3 list and create, F-O4 edit. */
export function TeamsScreen() {
  const clubs = useResource<{ clubs: ClubSummary[] }>("v1/staff/clubs");
  const teams = useResource<{ teams: TeamSummary[] }>("v1/staff/teams");
  const [editing, setEditing] = useState<string | null>(null);

  return (
    <ConsoleChrome
      title={consoleCopy.teams.title}
      back={{ href: routes.staffAdmin, label: consoleCopy.admin.backToSearch }}
    >
      <AdminNav />
      {clubs.error ? <ConsoleNotice message={clubs.error} /> : null}
      {teams.error ? <ConsoleNotice message={teams.error} /> : null}

      <section className="console-card" aria-label={consoleCopy.teams.create}>
        <h2 className="console-card__title">{consoleCopy.teams.create}</h2>
        <TeamForm
          clubs={clubs.data?.clubs ?? []}
          onSaved={() => {
            teams.reload();
            clubs.reload();
          }}
        />
      </section>

      <section className="console-card" aria-label={consoleCopy.teams.title}>
        <h2 className="console-card__title">{consoleCopy.teams.title}</h2>
        {teams.loading ? <p>{consoleCopy.loading}</p> : null}
        {teams.data && teams.data.teams.length === 0 ? (
          <p>{consoleCopy.teams.empty}</p>
        ) : null}
        <ul className="console-list">
          {(teams.data?.teams ?? []).map((team) => (
            <li key={team.id} className="console-list__item">
              <div className="console-list__row">
                <strong>{team.name}</strong>
                <span>{team.clubName}</span>
                <span>{team.seasonId}</span>
                <span>{team.timeZone}</span>
                <span>{consoleCopy.teams.playerCount(team.playerCount)}</span>
                <Link href={routes.staffAdminTeam(team.id)}>
                  {consoleCopy.teams.openRoster}
                </Link>
                <button
                  type="button"
                  className="button button--outline"
                  aria-expanded={editing === team.id}
                  onClick={() =>
                    setEditing(editing === team.id ? null : team.id)
                  }
                >
                  {consoleCopy.teams.edit}
                </button>
              </div>
              {editing === team.id ? (
                <div className="console-edit">
                  <h3>{consoleCopy.teams.editing(team.name)}</h3>
                  <TeamForm
                    clubs={clubs.data?.clubs ?? []}
                    team={team}
                    onSaved={() => {
                      setEditing(null);
                      teams.reload();
                    }}
                  />
                </div>
              ) : null}
            </li>
          ))}
        </ul>
      </section>
    </ConsoleChrome>
  );
}
