"use client";

import { consoleCopy, staffCopy } from "../console/copy";

import { FormEvent, useState } from "react";
import { routes } from "../../content/routes";
import { ConsoleChrome, ConsoleNotice } from "../console/ConsoleChrome";
import { ConsoleRowLink } from "../console/ConsoleRowLink";
import { consoleRequest, messageFor } from "../console/api";
import type { RosterEntry, TeamSummary } from "../console/types";
import { AdminNav } from "./AdminNav";

interface Results {
  players: RosterEntry[];
  teams: TeamSummary[];
}

/**
 * F-O1. The operator's real workload is an interrupt — someone cannot sign in
 * and wants it fixed now — so search is the whole screen and a player result
 * opens the one repair page rather than a profile.
 */
export function AdminSearch() {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<Results | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!query.trim()) return;
    setBusy(true);
    setError("");
    try {
      setResults(
        await consoleRequest<Results>("v1/staff/search", {
          query: { q: query.trim() },
        }),
      );
    } catch (caught) {
      setError(messageFor(caught));
      setResults(null);
    } finally {
      setBusy(false);
    }
  }

  const empty =
    results !== null &&
    results.players.length === 0 &&
    results.teams.length === 0;

  return (
    <ConsoleChrome title={consoleCopy.admin.title}>
      <AdminNav />
      <p>{consoleCopy.admin.intro}</p>
      <form
        method="post"
        onSubmit={submit}
        noValidate
        className="console-form console-search"
      >
        <label htmlFor="console-search">{consoleCopy.admin.searchLabel}</label>
        <input
          id="console-search"
          name="q"
          type="search"
          autoComplete="off"
          autoCapitalize="none"
          aria-describedby="console-search-hint"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          required
        />
        <p id="console-search-hint" className="console-hint">
          {consoleCopy.admin.searchHint}
        </p>
        <button className="button button--lime" disabled={busy}>
          {busy ? staffCopy.working : consoleCopy.admin.searchAction}
        </button>
      </form>

      {error ? <ConsoleNotice message={error} /> : null}
      {empty ? <p>{consoleCopy.admin.searchEmpty}</p> : null}

      {results && results.players.length > 0 ? (
        <section
          className="console-card"
          aria-label={consoleCopy.admin.playersHeading}
        >
          <h2 className="console-card__title">
            {consoleCopy.admin.playersHeading}
          </h2>
          <ul className="console-list">
            {results.players.map((player) => (
              <ConsoleRowLink
                key={player.playerId}
                href={routes.staffAdminPlayer(player.playerId)}
                name={`${player.firstName} ${player.lastInitial}`}
              >
                <span>
                  {consoleCopy.credential.state[player.credentialState]}
                </span>
                <span>{player.accountStatus}</span>
              </ConsoleRowLink>
            ))}
          </ul>
        </section>
      ) : null}

      {results && results.teams.length > 0 ? (
        <section
          className="console-card"
          aria-label={consoleCopy.admin.teamsHeading}
        >
          <h2 className="console-card__title">
            {consoleCopy.admin.teamsHeading}
          </h2>
          <ul className="console-list">
            {results.teams.map((team) => (
              <ConsoleRowLink
                key={team.id}
                href={routes.staffAdminTeam(team.id)}
                name={team.name}
              >
                <span>{team.clubName}</span>
                <span>{consoleCopy.teams.playerCount(team.playerCount)}</span>
              </ConsoleRowLink>
            ))}
          </ul>
        </section>
      ) : null}
    </ConsoleChrome>
  );
}
