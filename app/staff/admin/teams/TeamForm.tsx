"use client";

import { consoleCopy, staffCopy } from "../../console/copy";

import { FormEvent, useState } from "react";
import { consoleRequest, messageFor } from "../../console/api";
import { defaultTimeZone, timeZonesIncluding } from "../../console/time-zones";
import type { ClubSummary, TeamSummary } from "../../console/types";

const WEEKLY_GOALS = [1, 2, 3, 4, 5, 6, 7];

/**
 * F-O3 and F-O4. The time zone is a validated picker, never a text field,
 * because it decides what "today" means for every date on the team. Changing it
 * on an existing team is therefore refused once and explained before it is
 * accepted (REQ-604).
 */
export function TeamForm({
  clubs,
  team,
  onSaved,
}: {
  clubs: ClubSummary[];
  team?: TeamSummary;
  onSaved: () => void;
}) {
  const [clubId, setClubId] = useState(team?.clubId ?? clubs[0]?.id ?? "");
  const [name, setName] = useState(team?.name ?? "");
  const [seasonId, setSeasonId] = useState(team?.seasonId ?? "");
  const [timeZone, setTimeZone] = useState(team?.timeZone ?? defaultTimeZone());
  const [weeklyGoal, setWeeklyGoal] = useState(team?.weeklyGoal ?? 3);
  const [pendingZoneChange, setPendingZoneChange] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const zoneChanged = Boolean(team) && team!.timeZone !== timeZone;

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (zoneChanged && !pendingZoneChange) {
      setPendingZoneChange(true);
      return;
    }
    setBusy(true);
    setError("");
    try {
      await consoleRequest<TeamSummary>(
        team ? `v1/staff/teams/${team.id}` : "v1/staff/teams",
        {
          method: team ? "PUT" : "POST",
          body: {
            clubId,
            name: name.trim(),
            seasonId: seasonId.trim(),
            timeZone,
            weeklyGoal,
          },
        },
      );
      setPendingZoneChange(false);
      if (!team) {
        setName("");
        setSeasonId("");
      }
      onSaved();
    } catch (caught) {
      setError(messageFor(caught));
    } finally {
      setBusy(false);
    }
  }

  if (!team && clubs.length === 0) {
    return <p>{consoleCopy.teams.needsClub}</p>;
  }

  const fieldPrefix = team ? `team-${team.id}` : "new-team";

  return (
    <form onSubmit={submit} noValidate className="console-form">
      <label htmlFor={`${fieldPrefix}-club`}>
        {consoleCopy.teams.clubLabel}
      </label>
      <select
        id={`${fieldPrefix}-club`}
        name="clubId"
        value={clubId}
        onChange={(event) => setClubId(event.target.value)}
        required
      >
        {clubs.map((club) => (
          <option key={club.id} value={club.id}>
            {club.name}
          </option>
        ))}
      </select>

      <label htmlFor={`${fieldPrefix}-name`}>
        {consoleCopy.teams.nameLabel}
      </label>
      <input
        id={`${fieldPrefix}-name`}
        name="name"
        type="text"
        autoComplete="off"
        value={name}
        onChange={(event) => setName(event.target.value)}
        required
      />

      <label htmlFor={`${fieldPrefix}-season`}>
        {consoleCopy.teams.seasonLabel}
      </label>
      <input
        id={`${fieldPrefix}-season`}
        name="seasonId"
        type="text"
        autoComplete="off"
        value={seasonId}
        onChange={(event) => setSeasonId(event.target.value)}
        required
      />

      <label htmlFor={`${fieldPrefix}-zone`}>
        {consoleCopy.teams.timeZoneLabel}
      </label>
      <select
        id={`${fieldPrefix}-zone`}
        name="timeZone"
        value={timeZone}
        onChange={(event) => {
          setPendingZoneChange(false);
          setTimeZone(event.target.value);
        }}
        required
      >
        {timeZonesIncluding(team?.timeZone).map((zone) => (
          <option key={zone} value={zone}>
            {zone}
          </option>
        ))}
      </select>

      <label htmlFor={`${fieldPrefix}-goal`}>
        {consoleCopy.teams.weeklyGoalLabel}
      </label>
      <select
        id={`${fieldPrefix}-goal`}
        name="weeklyGoal"
        value={weeklyGoal}
        onChange={(event) => setWeeklyGoal(Number(event.target.value))}
        required
      >
        {WEEKLY_GOALS.map((goal) => (
          <option key={goal} value={goal}>
            {goal}
          </option>
        ))}
      </select>

      {pendingZoneChange && team ? (
        <p className="console-warning" role="alert">
          {consoleCopy.teams.timeZoneWarning(team.timeZone, timeZone)}
        </p>
      ) : null}
      {error ? (
        <p className="notice notice--error" role="alert">
          {error}
        </p>
      ) : null}

      <button className="button button--lime" disabled={busy}>
        {busy
          ? staffCopy.working
          : pendingZoneChange
            ? consoleCopy.teams.timeZoneConfirm
            : team
              ? consoleCopy.teams.save
              : consoleCopy.teams.create}
      </button>
    </form>
  );
}
