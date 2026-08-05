"use client";

import { useState } from "react";
import { Avatar } from "../components/Avatar";
import {
  activities,
  CURRENT_PLAYER_ID,
  players,
  TEAM_NAME,
} from "../data/mockData";
import { useTraining } from "../state/training-context";

const kitColors = ["#c7f23a", "#7459ff", "#34cbb2", "#ff9a62"];

export default function MePage() {
  const { entries } = useTraining();
  const basePlayer = players.find((player) => player.id === CURRENT_PLAYER_ID)!;
  const [kitColor, setKitColor] = useState(basePlayer.avatarColor);
  const [builderOpen, setBuilderOpen] = useState(false);
  const player = { ...basePlayer, avatarColor: kitColor };
  const personalEntries = entries.filter(
    (entry) => entry.playerId === CURRENT_PLAYER_ID,
  );

  return (
    <div className="page page--me">
      <header className="profile-hero">
        <Avatar player={player} size="large" />
        <div>
          <p className="eyebrow">Player profile</p>
          <h1>
            {player.firstName} {player.lastInitial}
          </h1>
          <p>{TEAM_NAME}</p>
        </div>
        <button
          className="button button--outline"
          type="button"
          onClick={() => setBuilderOpen((open) => !open)}
        >
          {builderOpen ? "Close builder" : "Avatar builder"}
        </button>
      </header>
      {builderOpen ? (
        <section className="card avatar-builder">
          <div>
            <p className="eyebrow">Locked avatar options</p>
            <h2>Choose a kit color</h2>
            <p>No photo upload or custom text is available.</p>
          </div>
          <div className="swatches" role="group" aria-label="Kit color">
            {kitColors.map((color) => (
              <button
                key={color}
                type="button"
                className={kitColor === color ? "is-selected" : ""}
                style={{ background: color }}
                aria-label={`Choose ${color} kit`}
                onClick={() => setKitColor(color)}
              />
            ))}
          </div>
        </section>
      ) : null}
      <section className="profile-grid">
        <article className="card profile-action">
          <span aria-hidden="true">▦</span>
          <div>
            <h2>Session history</h2>
            <p>{personalEntries.length} saved sessions on this device</p>
          </div>
        </article>
        <article className="card profile-action">
          <span aria-hidden="true">↗</span>
          <div>
            <h2>Assessment history</h2>
            <p>Private to you and authorized coaches</p>
          </div>
          <span className="pill">Coming later</span>
        </article>
        <article className="card profile-action">
          <span aria-hidden="true">◇</span>
          <div>
            <h2>QR + PIN security</h2>
            <p>Mocked for milestone 1</p>
          </div>
          <span className="pill">Prototype</span>
        </article>
      </section>
      <section className="card recent-card">
        <div className="section-heading">
          <div>
            <p className="eyebrow">Private</p>
            <h2>Your session history</h2>
          </div>
        </div>
        <div className="history-list">
          {personalEntries.map((entry) => {
            const activity = activities.find(
              (item) => item.id === entry.activityId,
            )!;
            return (
              <article className="history-row" key={entry.id}>
                <span className="history-row__icon" aria-hidden="true">
                  {activity.icon}
                </span>
                <div>
                  <strong>{activity.name}</strong>
                  <p>
                    {new Date(entry.occurredAt).toLocaleString(undefined, {
                      month: "short",
                      day: "numeric",
                      hour: "numeric",
                      minute: "2-digit",
                    })}
                  </p>
                </div>
                <span className="pill">
                  {entry.value} {entry.unit}
                </span>
              </article>
            );
          })}
        </div>
      </section>
    </div>
  );
}
