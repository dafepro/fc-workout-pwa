"use client";

import { FormEvent, useState } from "react";

import { consoleCopy, staffCopy } from "../copy";
import { ConsoleNotice } from "../ConsoleChrome";
import { consoleRequest, messageFor } from "../api";
import type { RosterEntry } from "../types";

/** F-C3. Membership begins on the team's own local date, which the API decides. */
export function AddExistingPlayer({
  teamId,
  onAdded,
}: {
  teamId: string;
  onAdded: () => void;
}) {
  const [query, setQuery] = useState("");
  const [matches, setMatches] = useState<RosterEntry[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function search(event: FormEvent) {
    event.preventDefault();
    if (!query.trim()) return;
    setBusy(true);
    setError("");
    try {
      const results = await consoleRequest<{ players: RosterEntry[] }>(
        "v1/staff/search",
        { query: { q: query.trim() } },
      );
      setMatches(results.players);
    } catch (caught) {
      setError(messageFor(caught));
    } finally {
      setBusy(false);
    }
  }

  async function add(playerId: string) {
    setError("");
    try {
      await consoleRequest<void>(`v1/staff/teams/${teamId}/roster`, {
        method: "POST",
        body: { playerId },
      });
      setMatches(null);
      setQuery("");
      onAdded();
    } catch (caught) {
      setError(messageFor(caught));
    }
  }

  return (
    <section
      className="console-card"
      aria-label={consoleCopy.roster.addExisting}
    >
      <h2 className="console-card__title">{consoleCopy.roster.addExisting}</h2>
      <form method="post" onSubmit={search} noValidate className="console-form">
        <label htmlFor="roster-search">{consoleCopy.roster.addExisting}</label>
        <input
          id="roster-search"
          name="q"
          type="search"
          autoComplete="off"
          aria-describedby="roster-search-hint"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          required
        />
        <p id="roster-search-hint" className="console-hint">
          {consoleCopy.roster.addExistingHint}
        </p>
        <button className="button button--outline" disabled={busy}>
          {busy ? staffCopy.working : consoleCopy.admin.searchAction}
        </button>
      </form>
      {error ? <ConsoleNotice message={error} /> : null}
      {matches && matches.length === 0 ? (
        <p>{consoleCopy.admin.searchEmpty}</p>
      ) : null}
      <ul className="console-list">
        {(matches ?? []).map((match) => (
          <li key={match.playerId} className="console-list__row">
            <span>
              {match.firstName} {match.lastInitial}
            </span>
            <button
              type="button"
              className="button button--outline"
              onClick={() => add(match.playerId)}
            >
              {consoleCopy.roster.add}
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}
