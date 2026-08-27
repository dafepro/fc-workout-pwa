"use client";

import { FormEvent, useCallback, useEffect, useRef, useState } from "react";

import { consoleRequest, ConsoleError, messageFor } from "../api";
import { ConfirmButton } from "../ConfirmButton";
import { consoleCopy, staffCopy } from "../copy";
import type { StaffTeamReward, TeamRewardDefinition } from "../types";

export function TeamRewardPanel({ teamId }: { teamId: string }) {
  const [definitions, setDefinitions] = useState<TeamRewardDefinition[]>([]);
  const [reward, setReward] = useState<StaffTeamReward | null>(null);
  const [startsOn, setStartsOn] = useState("");
  const [endsOn, setEndsOn] = useState("");
  const [requiredDays, setRequiredDays] = useState("3");
  const [minimumRosterPercent, setMinimumRosterPercent] = useState("70");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const publishKey = useRef("");

  const load = useCallback(async () => {
    setError("");
    try {
      const [catalog, current] = await Promise.all([
        consoleRequest<{ definitions: TeamRewardDefinition[] }>(
          "v1/staff/team-reward-definitions",
        ),
        consoleRequest<StaffTeamReward>(
          `v1/staff/teams/${teamId}/team-reward`,
        ).catch((caught: unknown) => {
          if (caught instanceof ConsoleError && caught.status === 404)
            return null;
          throw caught;
        }),
      ]);
      setDefinitions(catalog.definitions);
      setReward(current);
    } catch (caught) {
      setError(messageFor(caught));
    }
  }, [teamId]);

  useEffect(() => void load(), [load]);

  async function publish(event: FormEvent) {
    event.preventDefault();
    const definition = definitions[0];
    if (!definition) return;
    setBusy(true);
    setError("");
    setNotice("");
    publishKey.current ||= crypto.randomUUID();
    try {
      const created = await consoleRequest<StaffTeamReward>(
        `v1/staff/teams/${teamId}/team-reward`,
        {
          method: "POST",
          idempotencyKey: publishKey.current,
          body: {
            definitionId: definition.id,
            startsOn,
            endsOn,
            requiredDays: Number(requiredDays),
            minimumRosterPercent: Number(minimumRosterPercent),
          },
        },
      );
      publishKey.current = "";
      setReward(created);
      setNotice(consoleCopy.teamReward.published);
    } catch (caught) {
      setError(messageFor(caught));
    } finally {
      setBusy(false);
    }
  }

  async function cancel() {
    if (!reward) return;
    setBusy(true);
    setError("");
    setNotice("");
    try {
      await consoleRequest(
        `v1/staff/teams/${teamId}/team-reward/${reward.id}/cancel`,
        { method: "POST" },
      );
      setReward(null);
      setNotice(consoleCopy.teamReward.cancelled);
    } catch (caught) {
      setError(messageFor(caught));
    } finally {
      setBusy(false);
    }
  }

  const definition = definitions[0];
  return (
    <section className="console-card" aria-label={consoleCopy.teamReward.title}>
      <h2 className="console-card__title">{consoleCopy.teamReward.title}</h2>
      <p className="console-hint">{consoleCopy.teamReward.devHint}</p>
      {error ? (
        <p className="notice notice--error" role="alert">
          {error}
        </p>
      ) : null}
      {notice ? <p className="notice notice--success">{notice}</p> : null}

      {reward ? (
        <div>
          <h3>{reward.title}</h3>
          <p>{reward.description}</p>
          <p>
            {consoleCopy.teamReward.progress(
              reward.progress.current,
              reward.progress.target,
            )}
          </p>
          <p className="console-hint">
            {consoleCopy.teamReward.rule(
              reward.rule.requiredDays,
              reward.rule.minimumRosterPercent,
            )}{" "}
            · {consoleCopy.teamReward.window(reward.startsOn, reward.endsOn)}
          </p>
          {reward.status === "active" ? (
            <ConfirmButton
              label={consoleCopy.teamReward.cancel}
              question={consoleCopy.teamReward.cancelQuestion}
              confirmLabel={consoleCopy.teamReward.cancelConfirm}
              onConfirm={cancel}
            />
          ) : null}
        </div>
      ) : (
        <>
          <p>{consoleCopy.teamReward.none}</p>
          {definition ? (
            <form className="console-form" onSubmit={publish}>
              <h3>{definition.title}</h3>
              <p>{definition.description}</p>
              <label htmlFor="reward-starts-on">
                {consoleCopy.teamReward.startsOn}
              </label>
              <input
                id="reward-starts-on"
                type="date"
                required
                value={startsOn}
                onChange={(event) => setStartsOn(event.target.value)}
              />
              <label htmlFor="reward-ends-on">
                {consoleCopy.teamReward.endsOn}
              </label>
              <input
                id="reward-ends-on"
                type="date"
                required
                value={endsOn}
                onChange={(event) => setEndsOn(event.target.value)}
              />
              <label htmlFor="reward-days">
                {consoleCopy.teamReward.requiredDays}
              </label>
              <select
                id="reward-days"
                value={requiredDays}
                onChange={(event) => setRequiredDays(event.target.value)}
              >
                {Array.from({ length: 30 }, (_, index) => index + 1).map(
                  (day) => (
                    <option key={day} value={day}>
                      {day}
                    </option>
                  ),
                )}
              </select>
              <label htmlFor="reward-percent">
                {consoleCopy.teamReward.participation}
              </label>
              <select
                id="reward-percent"
                value={minimumRosterPercent}
                onChange={(event) =>
                  setMinimumRosterPercent(event.target.value)
                }
              >
                {[50, 60, 70, 80, 90, 100].map((percent) => (
                  <option key={percent} value={percent}>
                    {consoleCopy.teamReward.participationOption(percent)}
                  </option>
                ))}
              </select>
              <button
                className="button button--lime"
                disabled={busy || !startsOn || !endsOn}
              >
                {busy ? staffCopy.working : consoleCopy.teamReward.publish}
              </button>
            </form>
          ) : null}
        </>
      )}
    </section>
  );
}
