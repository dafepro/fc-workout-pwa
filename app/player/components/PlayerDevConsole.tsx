"use client";

import type { ChangeEvent } from "react";
import { playerExperienceCopy } from "../content";
import {
  type PlayerDevSettings,
  usePlayerDevSettings,
} from "../dev/PlayerDevSettings";

export function PlayerDevConsole() {
  const { enabled, settings, update, reset } = usePlayerDevSettings();
  if (!enabled) return null;
  const copy = playerExperienceCopy.devConsole;

  function select<
    K extends "momentumBand" | "today" | "teamAccess" | "teamLoungeVersion",
  >(key: K) {
    return (event: ChangeEvent<HTMLSelectElement>) =>
      update({ [key]: event.target.value } as Pick<PlayerDevSettings, K>);
  }

  return (
    <details className="player-dev-console">
      <summary>
        <span>
          <strong>{copy.title}</strong>
          <small>{copy.summary}</small>
        </span>
        <span className="pill">DEV</span>
      </summary>
      <div className="player-dev-console__body">
        <p>{copy.body}</p>
        <div className="player-dev-console__grid">
          <label>
            <span>{copy.momentumPreview}</span>
            <select
              aria-label={copy.momentumPreview}
              value={settings.momentumBand}
              onChange={select("momentumBand")}
            >
              <option value="real">Live value</option>
              <option value="ready">Ready</option>
              <option value="started">Started</option>
              <option value="building">Building</option>
              <option value="on-a-roll">On a roll</option>
            </select>
          </label>
          <label>
            <span>{copy.todayPreview}</span>
            <select
              aria-label={copy.todayPreview}
              value={settings.today}
              onChange={select("today")}
            >
              <option value="real">Live state</option>
              <option value="training">Training plan</option>
              <option value="rest">Rest plan</option>
              <option value="complete">Completed plan</option>
            </select>
          </label>
          <label>
            <span>{copy.teamAccess}</span>
            <select
              aria-label={copy.teamAccess}
              value={settings.teamAccess}
              onChange={select("teamAccess")}
            >
              <option value="real">Live access</option>
              <option value="locked">Force locked presentation</option>
            </select>
          </label>
          <label>
            <span>{copy.teamLoungeVersion}</span>
            <select
              aria-label={copy.teamLoungeVersion}
              value={settings.teamLoungeVersion}
              onChange={select("teamLoungeVersion")}
            >
              <option value="v1">V1 · Current Canvas</option>
              <option value="v2">V2 · Canvas library preview</option>
            </select>
          </label>
        </div>
        <div className="player-dev-console__toggles">
          <label>
            <input
              type="checkbox"
              checked={settings.momentumVisible}
              onChange={(event) =>
                update({ momentumVisible: event.target.checked })
              }
            />
            <span>{copy.showMomentum}</span>
          </label>
          <label>
            <input
              type="checkbox"
              checked={settings.rewardsVisible}
              onChange={(event) =>
                update({ rewardsVisible: event.target.checked })
              }
            />
            <span>{copy.showRewards}</span>
          </label>
        </div>
        <button
          type="button"
          className="button button--outline"
          onClick={reset}
        >
          {copy.reset}
        </button>
      </div>
    </details>
  );
}
