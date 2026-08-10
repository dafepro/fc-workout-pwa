"use client";

import { consoleCopy, staffCopy } from "../../../console/copy";

import { FormEvent, useState } from "react";
import Link from "next/link";
import { routes } from "../../../../content/routes";
import { ConsoleChrome, ConsoleNotice } from "../../../console/ConsoleChrome";
import { ConfirmButton } from "../../../console/ConfirmButton";
import { CredentialRevealPanel } from "../../../console/RevealOnce";
import { ConsoleError, consoleRequest, messageFor } from "../../../console/api";
import { useResource } from "../../../console/useResource";
import type {
  AssignmentCatalogEntry,
  AssignmentCompletion,
  AssignmentSummary,
  CredentialReveal,
  PlayerCompletion,
  RosterEntry,
  TeamSummary,
} from "../../../console/types";

/**
 * F-C2 through F-C5, unscoped for the operator (F-O8). The operator and coach
 * consoles share this one screen; only where it links to (the teams list and
 * a player's own repair screen) differs between them, since those routes are
 * gated separately in the UI (the API authorizes both regardless, per SEC-5).
 */
export function TeamRoster({
  teamId,
  backHref = routes.staffAdminTeams,
  backLabel = consoleCopy.teams.title,
  playerHref = routes.staffAdminPlayer,
  operator = true,
}: {
  teamId: string;
  backHref?: string;
  backLabel?: string;
  playerHref?: (playerId: string) => string;
  /** Adding an existing player needs the platform-wide player search, which is
   * operator-only in the API and behind the Access gate in the console. A coach
   * was already refused it; hiding the panel is what stops the refusal from
   * arriving as a login page they cannot use. */
  operator?: boolean;
}) {
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
      title={team.data?.name ?? consoleCopy.roster.title}
      back={{
        href: backHref,
        label: backLabel,
      }}
    >
      {team.error ? <ConsoleNotice message={team.error} /> : null}
      {roster.error ? <ConsoleNotice message={roster.error} /> : null}
      {error ? <ConsoleNotice message={error} /> : null}

      {team.data ? (
        <dl className="console-facts">
          <dt>{consoleCopy.teams.clubLabel}</dt>
          <dd>{team.data.clubName}</dd>
          <dt>{consoleCopy.teams.seasonLabel}</dt>
          <dd>{team.data.seasonId}</dd>
          <dt>{consoleCopy.teams.timeZoneLabel}</dt>
          <dd>{team.data.timeZone}</dd>
          <dt>{consoleCopy.teams.weeklyGoalLabel}</dt>
          <dd>{team.data.weeklyGoal}</dd>
        </dl>
      ) : null}

      {reveal ? (
        <CredentialRevealPanel
          reveal={reveal}
          onDismiss={() => setReveal(null)}
        />
      ) : null}

      <section className="console-card" aria-label={consoleCopy.roster.title}>
        <h2 className="console-card__title">{consoleCopy.roster.title}</h2>
        {roster.loading ? <p>{consoleCopy.loading}</p> : null}
        {roster.data && roster.data.roster.length === 0 ? (
          <p>{consoleCopy.roster.empty}</p>
        ) : null}
        <ul className="console-list">
          {(roster.data?.roster ?? []).map((entry) => (
            <li key={entry.playerId} className="console-list__row">
              <Link href={playerHref(entry.playerId)}>
                {entry.firstName} {entry.lastInitial}
              </Link>
              <span>{consoleCopy.credential.state[entry.credentialState]}</span>
              <span>
                {consoleCopy.player.from} {entry.membershipFrom}
              </span>
              <span>
                {consoleCopy.roster.lastActivity}:{" "}
                {entry.lastActivityOn ?? consoleCopy.roster.never}
              </span>
              {entry.membershipTo ? (
                <span>
                  {consoleCopy.player.to} {entry.membershipTo}
                </span>
              ) : (
                <ConfirmButton
                  label={consoleCopy.roster.endMembership}
                  question={consoleCopy.player.endMembershipConfirm}
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

      {operator ? (
        <AddExistingPlayer
          teamId={teamId}
          onAdded={() => {
            roster.reload();
            team.reload();
          }}
        />
      ) : null}

      <ProvisionPlayer
        teamId={teamId}
        onProvisioned={(created) => {
          setReveal(created);
          roster.reload();
          team.reload();
        }}
      />

      <AssignmentPanel teamId={teamId} />
    </ConsoleChrome>
  );
}

/** F-C7 and F-C8: set the team's assignment from the approved catalog, and
 * watch who has completed it using the Completed / One Away / Keep Going
 * grouping from UX_AND_SAFETY_RULES.md -- never a raw value. */
function AssignmentPanel({ teamId }: { teamId: string }) {
  const catalog = useResource<{ catalog: AssignmentCatalogEntry[] }>(
    "v1/staff/assignment-catalog",
  );
  const assignments = useResource<{
    assignments: AssignmentSummary[];
    current: AssignmentCompletion;
  }>(`v1/staff/teams/${teamId}/assignments`);

  const [catalogKey, setCatalogKey] = useState("");
  const [targetValue, setTargetValue] = useState("");
  const [targetUnit, setTargetUnit] = useState("");
  const [startsOn, setStartsOn] = useState("");
  const [dueOn, setDueOn] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  function chooseCatalogEntry(key: string) {
    setCatalogKey(key);
    const entry = catalog.data?.catalog.find((item) => item.key === key);
    if (entry) {
      setTargetValue(String(entry.defaultTargetValue));
      setTargetUnit(entry.defaultTargetUnit);
    }
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      await consoleRequest<{ id: string }>(
        `v1/staff/teams/${teamId}/assignments`,
        {
          method: "POST",
          body: {
            catalogKey,
            targetValue: Number(targetValue),
            targetUnit,
            startsOn,
            dueOn,
          },
        },
      );
      setCatalogKey("");
      setTargetValue("");
      setTargetUnit("");
      setStartsOn("");
      setDueOn("");
      assignments.reload();
    } catch (caught) {
      setError(messageFor(caught));
    } finally {
      setBusy(false);
    }
  }

  const current = assignments.data?.current;

  return (
    <section
      className="console-card"
      aria-label={consoleCopy.assignments.title}
    >
      <h2 className="console-card__title">{consoleCopy.assignments.title}</h2>
      {assignments.error ? <ConsoleNotice message={assignments.error} /> : null}
      {assignments.loading ? <p>{consoleCopy.loading}</p> : null}

      {current && current.assignment ? (
        <>
          <p>
            {current.assignment.activityName}{" "}
            {consoleCopy.assignments.window(
              current.assignment.startsOn,
              current.assignment.dueOn,
            )}
          </p>
          <CompletionGroup
            label={consoleCopy.assignments.completed}
            players={current.completed}
          />
          <CompletionGroup
            label={consoleCopy.assignments.oneAway}
            players={current.oneAway}
          />
          <CompletionGroup
            label={consoleCopy.assignments.keepGoing}
            players={current.keepGoing}
          />
        </>
      ) : (
        <p>{consoleCopy.assignments.noneLive}</p>
      )}

      <h3 className="console-card__title">
        {consoleCopy.assignments.historyTitle}
      </h3>
      {assignments.data && assignments.data.assignments.length === 0 ? (
        <p>{consoleCopy.assignments.empty}</p>
      ) : null}
      <ul className="console-list">
        {(assignments.data?.assignments ?? []).map((assignment) => (
          <li key={assignment.id} className="console-list__row">
            <strong>{assignment.activityName}</strong>
            <span>
              {assignment.targetValue} {assignment.targetUnit}
            </span>
            <span>
              {consoleCopy.assignments.window(
                assignment.startsOn,
                assignment.dueOn,
              )}
            </span>
          </li>
        ))}
      </ul>

      <form method="post" onSubmit={submit} noValidate className="console-form">
        <p className="console-hint">{consoleCopy.assignments.createHint}</p>
        <label htmlFor="assignment-catalog">
          {consoleCopy.assignments.catalogLabel}
        </label>
        <select
          id="assignment-catalog"
          value={catalogKey}
          onChange={(event) => chooseCatalogEntry(event.target.value)}
          required
        >
          <option value="" disabled>
            {consoleCopy.assignments.catalogLabel}
          </option>
          {(catalog.data?.catalog ?? []).map((entry) => (
            <option key={entry.key} value={entry.key}>
              {entry.displayName}
            </option>
          ))}
        </select>
        <label htmlFor="assignment-target-value">
          {consoleCopy.assignments.targetValueLabel}
        </label>
        <input
          id="assignment-target-value"
          type="number"
          min="0"
          step="any"
          value={targetValue}
          onChange={(event) => setTargetValue(event.target.value)}
          required
        />
        <label htmlFor="assignment-target-unit">
          {consoleCopy.assignments.targetUnitLabel}
        </label>
        <input
          id="assignment-target-unit"
          type="text"
          value={targetUnit}
          readOnly
        />
        <label htmlFor="assignment-starts-on">
          {consoleCopy.assignments.startsOnLabel}
        </label>
        <input
          id="assignment-starts-on"
          type="date"
          value={startsOn}
          onChange={(event) => setStartsOn(event.target.value)}
          required
        />
        <label htmlFor="assignment-due-on">
          {consoleCopy.assignments.dueOnLabel}
        </label>
        <input
          id="assignment-due-on"
          type="date"
          value={dueOn}
          onChange={(event) => setDueOn(event.target.value)}
          required
        />
        {error ? (
          <p className="notice notice--error" role="alert">
            {error}
          </p>
        ) : null}
        <button
          className="button button--lime"
          disabled={busy || !catalogKey || !targetValue || !startsOn || !dueOn}
        >
          {busy ? staffCopy.working : consoleCopy.assignments.createAction}
        </button>
      </form>
    </section>
  );
}

function CompletionGroup({
  label,
  players,
}: {
  label: string;
  players: PlayerCompletion[];
}) {
  return (
    <section className="console-card" aria-label={label}>
      <h3 className="console-card__title">
        {label} ({players.length})
      </h3>
      {players.length === 0 ? (
        <p>{consoleCopy.assignments.noPlayers}</p>
      ) : (
        <ul className="console-list">
          {players.map((player) => (
            <li key={player.playerId} className="console-list__row">
              {player.firstName} {player.lastInitial}
            </li>
          ))}
        </ul>
      )}
    </section>
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
          ? consoleCopy.roster.provisionLocked
          : messageFor(caught),
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="console-card" aria-label={consoleCopy.roster.provision}>
      <h2 className="console-card__title">{consoleCopy.roster.provision}</h2>
      <p className="console-hint">{consoleCopy.roster.provisionHint}</p>
      <form method="post" onSubmit={submit} noValidate className="console-form">
        <label htmlFor="provision-first-name">
          {consoleCopy.roster.firstNameLabel}
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
          {consoleCopy.roster.lastInitialLabel}
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
          {busy ? staffCopy.working : consoleCopy.roster.provisionAction}
        </button>
      </form>
    </section>
  );
}
