"use client";

import { staffCopy } from "../../../console/copy";

import { FormEvent, useState } from "react";
import Link from "next/link";
import { copy } from "../../../../content/copy";
import { routes } from "../../../../content/routes";
import { ConsoleChrome, ConsoleNotice } from "../../../console/ConsoleChrome";
import { ConfirmButton } from "../../../console/ConfirmButton";
import { CredentialRevealPanel } from "../../../console/RevealOnce";
import { ConsoleError, consoleRequest, messageFor } from "../../../console/api";
import { useResource } from "../../../console/useResource";
import type {
  CredentialReveal,
  RosterEntry,
  TeamSummary,
} from "../../../console/types";

/** F-C2 through F-C5, unscoped for the operator (F-O8). */
export function TeamRoster({ teamId }: { teamId: string }) {
  const team = useResource<TeamSummary>(`v1/staff/teams/${teamId}`);
  const roster = useResource<{ roster: RosterEntry[] }>(
    `v1/staff/teams/${teamId}/roster`,
  );
  const [reveal, setReveal] = useState<CredentialReveal | null>(null);
  const [error, setError] = useState("");

  async function act(action: () => Promise<void>) {
    setError("");
    try {
      await action();
    } catch (caught) {
      setError(messageFor(caught));
    }
  }

  return (
    <ConsoleChrome
      title={team.data?.name ?? copy.console.roster.title}
      back={{
        href: routes.staffAdminTeams,
        label: copy.console.teams.title,
      }}
    >
      {team.error ? <ConsoleNotice message={team.error} /> : null}
      {roster.error ? <ConsoleNotice message={roster.error} /> : null}
      {error ? <ConsoleNotice message={error} /> : null}

      {team.data ? (
        <dl className="console-facts">
          <dt>{copy.console.teams.clubLabel}</dt>
          <dd>{team.data.clubName}</dd>
          <dt>{copy.console.teams.seasonLabel}</dt>
          <dd>{team.data.seasonId}</dd>
          <dt>{copy.console.teams.timeZoneLabel}</dt>
          <dd>{team.data.timeZone}</dd>
          <dt>{copy.console.teams.weeklyGoalLabel}</dt>
          <dd>{team.data.weeklyGoal}</dd>
        </dl>
      ) : null}

      {reveal ? (
        <CredentialRevealPanel
          reveal={reveal}
          onDismiss={() => setReveal(null)}
        />
      ) : null}

      <section className="console-card" aria-label={copy.console.roster.title}>
        <h2 className="console-card__title">{copy.console.roster.title}</h2>
        {roster.loading ? <p>{copy.console.loading}</p> : null}
        {roster.data && roster.data.roster.length === 0 ? (
          <p>{copy.console.roster.empty}</p>
        ) : null}
        <ul className="console-list">
          {(roster.data?.roster ?? []).map((entry) => (
            <li key={entry.playerId} className="console-list__row">
              <Link href={routes.staffAdminPlayer(entry.playerId)}>
                {entry.firstName} {entry.lastInitial}
              </Link>
              <span>
                {copy.console.credential.state[entry.credentialState]}
              </span>
              <span>
                {copy.console.player.from} {entry.membershipFrom}
              </span>
              <span>
                {copy.console.roster.lastActivity}:{" "}
                {entry.lastActivityOn ?? copy.console.roster.never}
              </span>
              {entry.membershipTo ? (
                <span>
                  {copy.console.player.to} {entry.membershipTo}
                </span>
              ) : (
                <ConfirmButton
                  label={copy.console.roster.endMembership}
                  question={copy.console.player.endMembershipConfirm}
                  onConfirm={() =>
                    act(async () => {
                      await consoleRequest<void>(
                        `v1/staff/teams/${teamId}/roster/${entry.playerId}`,
                        { method: "DELETE" },
                      );
                      roster.reload();
                    })
                  }
                />
              )}
            </li>
          ))}
        </ul>
      </section>

      <AddExistingPlayer
        teamId={teamId}
        onAdded={() => {
          roster.reload();
          team.reload();
        }}
      />

      <ProvisionPlayer
        teamId={teamId}
        onProvisioned={(created) => {
          setReveal(created);
          roster.reload();
          team.reload();
        }}
      />
    </ConsoleChrome>
  );
}

/** F-C3. Membership begins on the team's own local date, which the API decides. */
function AddExistingPlayer({
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
      aria-label={copy.console.roster.addExisting}
    >
      <h2 className="console-card__title">{copy.console.roster.addExisting}</h2>
      <form onSubmit={search} noValidate className="console-form">
        <label htmlFor="roster-search">{copy.console.roster.addExisting}</label>
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
          {copy.console.roster.addExistingHint}
        </p>
        <button className="button button--outline" disabled={busy}>
          {busy ? staffCopy.working : copy.console.admin.searchAction}
        </button>
      </form>
      {error ? <ConsoleNotice message={error} /> : null}
      {matches && matches.length === 0 ? (
        <p>{copy.console.admin.searchEmpty}</p>
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
              {copy.console.roster.add}
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}

/** F-C5. First name and last initial only, and the reveal happens once. */
function ProvisionPlayer({
  teamId,
  onProvisioned,
}: {
  teamId: string;
  onProvisioned: (reveal: CredentialReveal) => void;
}) {
  const [firstName, setFirstName] = useState("");
  const [lastInitial, setLastInitial] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function submit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      const created = await consoleRequest<CredentialReveal>(
        `v1/staff/teams/${teamId}/players`,
        {
          method: "POST",
          body: { firstName: firstName.trim(), lastInitial },
        },
      );
      setFirstName("");
      setLastInitial("");
      onProvisioned(created);
    } catch (caught) {
      // SEC-7: the console must not become the way real children's data gets
      // created before the deployment is approved for it.
      setError(
        caught instanceof ConsoleError && caught.code === "provisioning_locked"
          ? copy.console.roster.provisionLocked
          : messageFor(caught),
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <section
      className="console-card"
      aria-label={copy.console.roster.provision}
    >
      <h2 className="console-card__title">{copy.console.roster.provision}</h2>
      <p className="console-hint">{copy.console.roster.provisionHint}</p>
      <form onSubmit={submit} noValidate className="console-form">
        <label htmlFor="provision-first-name">
          {copy.console.roster.firstNameLabel}
        </label>
        <input
          id="provision-first-name"
          name="firstName"
          type="text"
          autoComplete="off"
          maxLength={40}
          value={firstName}
          onChange={(event) => setFirstName(event.target.value)}
          required
        />
        <label htmlFor="provision-last-initial">
          {copy.console.roster.lastInitialLabel}
        </label>
        <input
          id="provision-last-initial"
          name="lastInitial"
          type="text"
          autoComplete="off"
          maxLength={1}
          pattern="[A-Za-z]"
          value={lastInitial}
          onChange={(event) =>
            setLastInitial(
              event.target.value.replace(/[^A-Za-z]/g, "").slice(0, 1),
            )
          }
          required
        />
        {error ? (
          <p className="notice notice--error" role="alert">
            {error}
          </p>
        ) : null}
        <button
          className="button button--lime"
          disabled={busy || !firstName.trim() || !lastInitial}
        >
          {busy ? staffCopy.working : copy.console.roster.provisionAction}
        </button>
      </form>
    </section>
  );
}
