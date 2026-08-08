"use client";

import { staffCopy } from "../console/copy";

import { FormEvent, useState } from "react";
import Link from "next/link";
import { copy } from "../../content/copy";
import { routes } from "../../content/routes";
import { ConsoleChrome, ConsoleNotice } from "../console/ConsoleChrome";
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
    <ConsoleChrome title={copy.console.admin.title}>
      <AdminNav />
      <p>{copy.console.admin.intro}</p>
      <form
        onSubmit={submit}
        noValidate
        className="console-form console-search"
      >
        <label htmlFor="console-search">{copy.console.admin.searchLabel}</label>
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
          {copy.console.admin.searchHint}
        </p>
        <button className="button button--lime" disabled={busy}>
          {busy ? staffCopy.working : copy.console.admin.searchAction}
        </button>
      </form>

      {error ? <ConsoleNotice message={error} /> : null}
      {empty ? <p>{copy.console.admin.searchEmpty}</p> : null}

      {results && results.players.length > 0 ? (
        <section
          className="console-card"
          aria-label={copy.console.admin.playersHeading}
        >
          <h2 className="console-card__title">
            {copy.console.admin.playersHeading}
          </h2>
          <ul className="console-list">
            {results.players.map((player) => (
              <li key={player.playerId} className="console-list__row">
                <Link href={routes.staffAdminPlayer(player.playerId)}>
                  {player.firstName} {player.lastInitial}
                </Link>
                <span>
                  {copy.console.credential.state[player.credentialState]}
                </span>
                <span>{player.accountStatus}</span>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {results && results.teams.length > 0 ? (
        <section
          className="console-card"
          aria-label={copy.console.admin.teamsHeading}
        >
          <h2 className="console-card__title">
            {copy.console.admin.teamsHeading}
          </h2>
          <ul className="console-list">
            {results.teams.map((team) => (
              <li key={team.id} className="console-list__row">
                <Link href={routes.staffAdminTeam(team.id)}>{team.name}</Link>
                <span>{team.clubName}</span>
                <span>{copy.console.teams.playerCount(team.playerCount)}</span>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </ConsoleChrome>
  );
}
