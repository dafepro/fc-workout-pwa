"use client";
import { useState } from "react";
import type { SessionProfile } from "../data/player-runtime";
import { clearPlayerDrafts, useHasPlayerDrafts } from "../state/player-drafts";
import { qualityCopy } from "../content/quality-copy";
import {
  encodeTeamPreference,
  fetchWithTeamContext,
  persistTeamContext,
} from "../../lib/team-context";
import { routes } from "../content/routes";

export function TeamSwitcher({
  session,
  currentTeamID,
}: {
  session: SessionProfile;
  currentTeamID: string;
}) {
  const [selected, setSelected] = useState(currentTeamID);
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);
  const drafts = useHasPlayerDrafts();
  const [confirmDiscard, setConfirmDiscard] = useState(false);
  async function switchTeam() {
    if (drafts || busy || selected === currentTeamID) return;
    setBusy(true);
    setFailed(false);
    try {
      const response = await fetchWithTeamContext("/api/auth/team", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ teamId: selected }),
      });
      if (!response.ok) throw Error("Team unavailable");
      // A full navigation discards every previous team's mounted runtime together.
      const resolved = (await response.json()) as {
        playerId: string;
        activeTeamId: string;
      };
      if (
        resolved.playerId !== session.player.id ||
        resolved.activeTeamId !== selected
      )
        throw Error("Session changed");
      const stored = persistTeamContext(
        resolved.playerId,
        resolved.activeTeamId,
      );
      const handoff = stored
        ? ""
        : `#team-context=${encodeURIComponent(encodeTeamPreference(resolved.playerId, resolved.activeTeamId))}`;
      window.location.assign(routes.playerHome + handoff);
    } catch {
      setFailed(true);
      setBusy(false);
    }
  }
  return (
    <section aria-labelledby="team-context-title">
      <h2 id="team-context-title">{qualityCopy.teamContext.title}</h2>
      <p>{qualityCopy.teamContext.help}</p>
      {session.player.teams.length > 1 ? (
        <>
          <label>
            {qualityCopy.teamContext.label}
            <select
              value={selected}
              disabled={busy}
              onChange={(event) => setSelected(event.target.value)}
            >
              {session.player.teams.map((team) => (
                <option key={team.id} value={team.id}>
                  {team.name}
                </option>
              ))}
            </select>
          </label>
          <button
            className="button button--outline"
            type="button"
            disabled={busy || drafts || selected === currentTeamID}
            onClick={() => void switchTeam()}
          >
            {busy
              ? qualityCopy.teamContext.busy
              : qualityCopy.teamContext.action}
          </button>
        </>
      ) : null}
      {drafts ? (
        <>
          <p role="status">{qualityCopy.teamContext.draft}</p>
          {confirmDiscard ? (
            <div>
              <p>{qualityCopy.teamContext.discardHelp}</p>
              <button
                className="button button--outline"
                type="button"
                onClick={() => {
                  clearPlayerDrafts();
                  setConfirmDiscard(false);
                }}
              >
                {qualityCopy.teamContext.confirmDiscard}
              </button>
              <button
                className="button button--outline"
                type="button"
                onClick={() => setConfirmDiscard(false)}
              >
                {qualityCopy.teamContext.cancel}
              </button>
            </div>
          ) : (
            <button
              className="button button--outline"
              type="button"
              onClick={() => setConfirmDiscard(true)}
            >
              {qualityCopy.teamContext.discard}
            </button>
          )}
        </>
      ) : null}
      {failed ? <p role="alert">{qualityCopy.teamContext.failed}</p> : null}
    </section>
  );
}
