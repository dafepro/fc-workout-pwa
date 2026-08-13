"use client";

import { FormEvent, useState } from "react";

import { consoleCopy, staffCopy } from "../copy";
import { activityIcon } from "../../../content/activities";
import { WorkoutSelect } from "../../../components/WorkoutSelect";
import { ConfirmButton } from "../ConfirmButton";
import { ConsoleNotice } from "../ConsoleChrome";
import { consoleRequest, messageFor } from "../api";
import { useResource } from "../useResource";
import type {
  AssignmentCatalogEntry,
  AssignmentCompletion,
  AssignmentSummary,
  PlayerCompletion,
} from "../types";

/** F-C7 and F-C8: set the team's assignment from the approved catalog, and
 * watch who has completed it using the Completed / One Away / Keep Going
 * grouping from UX_AND_SAFETY_RULES.md -- never a raw value. */
export function AssignmentPanel({ teamId }: { teamId: string }) {
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

  const entries = catalog.data?.catalog ?? [];

  const choices = entries.map((entry) => ({
    key: entry.key,
    name: entry.displayName,
    description: `${entry.defaultTargetValue} ${entry.defaultTargetUnit}`,
    // The console has no activity vocabulary of its own; icons and accents come
    // from the same presentation module the player's picker reads.
    icon: activityIcon(entry.activityDefinitionId),
    accent: entry.activityDefinitionId,
  }));

  // The picker always shows a current choice, so an untouched form reads as
  // sitting on the first preset rather than on an empty option. Derived rather
  // than seeded into state, so the catalog arriving cannot fight the coach.
  const selectedKey = catalogKey || (entries[0]?.key ?? "");
  const selected = entries.find((entry) => entry.key === selectedKey);
  const target = targetValue || String(selected?.defaultTargetValue ?? "");
  const unit = targetUnit || (selected?.defaultTargetUnit ?? "");

  function chooseCatalogEntry(key: string) {
    const entry = entries.find((item) => item.key === key);
    if (!entry) return;
    setCatalogKey(key);
    setTargetValue(String(entry.defaultTargetValue));
    setTargetUnit(entry.defaultTargetUnit);
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
            catalogKey: selectedKey,
            targetValue: Number(target),
            targetUnit: unit,
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
          <AssignmentRow
            key={assignment.id}
            teamId={teamId}
            assignment={assignment}
            onChanged={assignments.reload}
          />
        ))}
      </ul>

      <form method="post" onSubmit={submit} noValidate className="console-form">
        <p className="console-hint">{consoleCopy.assignments.createHint}</p>
        <WorkoutSelect
          label={consoleCopy.assignments.catalogLabel}
          selectedKey={selectedKey}
          onSelect={chooseCatalogEntry}
          choices={choices}
          name="assignment-catalog"
          uniform
        />
        <label htmlFor="assignment-target-value">
          {consoleCopy.assignments.targetValueLabel}
        </label>
        {/* The preset fills this in; it stays editable because a preset is a
            starting point, not a rule. The unit is the activity's and is not
            a decision, so it reads as text beside the number. */}
        <div className="console-target">
          <input
            id="assignment-target-value"
            type="number"
            min="0"
            step="any"
            value={target}
            onChange={(event) => setTargetValue(event.target.value)}
            required
          />
          <span>{unit}</span>
        </div>
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
          disabled={busy || !selectedKey || !target || !startsOn || !dueOn}
        >
          {busy ? staffCopy.working : consoleCopy.assignments.createAction}
        </button>
      </form>
    </section>
  );
}

/**
 * REQ-513 and REQ-514. One row of the history, and the three things a coach can
 * do to it: amend the target or the dates, end it early, or -- only while it is
 * still a plan nobody has trained against -- delete it. The activity is not
 * amendable, because changing it would rewrite what players were already asked
 * for; the hint says so, and says to delete and re-set instead.
 */
function AssignmentRow({
  teamId,
  assignment,
  onChanged,
}: {
  teamId: string;
  assignment: AssignmentSummary;
  onChanged: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const [targetValue, setTargetValue] = useState(
    String(assignment.targetValue),
  );
  const [startsOn, setStartsOn] = useState(assignment.startsOn);
  const [dueOn, setDueOn] = useState(assignment.dueOn);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function run(request: () => Promise<unknown>) {
    setBusy(true);
    setError("");
    try {
      await request();
      setEditing(false);
      onChanged();
    } catch (caught) {
      // The backend's own refusal is the message worth showing: it is the one
      // that names the action that would have worked.
      setError(messageFor(caught));
    } finally {
      setBusy(false);
    }
  }

  const path = `v1/staff/teams/${teamId}/assignments/${assignment.id}`;

  return (
    <li className="console-list__row">
      <strong>{assignment.activityName}</strong>
      <span>
        {assignment.targetValue} {assignment.targetUnit}
      </span>
      <span>
        {consoleCopy.assignments.window(assignment.startsOn, assignment.dueOn)}
      </span>

      {editing ? (
        <div className="console-form">
          <p className="console-hint">{consoleCopy.assignments.amendHint}</p>
          <label htmlFor={`amend-target-${assignment.id}`}>
            {consoleCopy.assignments.targetValueLabel}
          </label>
          <div className="console-target">
            <input
              id={`amend-target-${assignment.id}`}
              type="number"
              min="0"
              step="any"
              value={targetValue}
              onChange={(event) => setTargetValue(event.target.value)}
            />
            <span>{assignment.targetUnit}</span>
          </div>
          <label htmlFor={`amend-starts-${assignment.id}`}>
            {consoleCopy.assignments.startsOnLabel}
          </label>
          <input
            id={`amend-starts-${assignment.id}`}
            type="date"
            value={startsOn}
            onChange={(event) => setStartsOn(event.target.value)}
          />
          <label htmlFor={`amend-due-${assignment.id}`}>
            {consoleCopy.assignments.dueOnLabel}
          </label>
          <input
            id={`amend-due-${assignment.id}`}
            type="date"
            value={dueOn}
            onChange={(event) => setDueOn(event.target.value)}
          />
          <div className="console-actions">
            <button
              type="button"
              className="button button--lime"
              disabled={busy}
              onClick={() =>
                run(() =>
                  consoleRequest(path, {
                    method: "PATCH",
                    body: {
                      targetValue: Number(targetValue),
                      targetUnit: assignment.targetUnit,
                      startsOn,
                      dueOn,
                    },
                  }),
                )
              }
            >
              {busy ? staffCopy.working : consoleCopy.assignments.save}
            </button>
            <button
              type="button"
              className="button button--outline"
              disabled={busy}
              onClick={() => setEditing(false)}
            >
              {consoleCopy.cancel}
            </button>
          </div>
        </div>
      ) : (
        <div className="console-actions">
          <button
            type="button"
            className="button button--outline"
            onClick={() => setEditing(true)}
          >
            {consoleCopy.assignments.amend}
          </button>
          <ConfirmButton
            label={consoleCopy.assignments.endEarly}
            question={consoleCopy.assignments.endEarlyConfirm}
            confirmLabel={consoleCopy.assignments.endEarlyAction}
            onConfirm={() =>
              run(() => consoleRequest(`${path}/end`, { method: "POST" }))
            }
          />
          <ConfirmButton
            label={consoleCopy.assignments.delete}
            question={consoleCopy.assignments.deleteConfirm}
            confirmLabel={consoleCopy.assignments.deleteAction}
            onConfirm={() =>
              run(() => consoleRequest(path, { method: "DELETE" }))
            }
          />
        </div>
      )}

      {error ? (
        <p className="notice notice--error" role="alert">
          {error}
        </p>
      ) : null}
    </li>
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
