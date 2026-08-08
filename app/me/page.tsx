"use client";

import { useState } from "react";
import { Avatar } from "../components/Avatar";
import { SessionList } from "../components/SessionList";
import { copy } from "../content/copy";
import { TEAM_NAME } from "../data/mockData";
import type { ReactionBadge } from "../domain/types";
import { useTraining } from "../state/training-context";
import { useAuth } from "../state/auth-context";

const kitColors = ["#c7f23a", "#7459ff", "#34cbb2", "#ff9a62"];

export default function MePage() {
  const {
    connected,
    signOut,
    currentPlayer: basePlayer,
    currentPlayerID,
    session,
  } = useAuth();
  const {
    entries,
    entriesStatus,
    refreshEntries,
    reactionBadges,
    reactionInboxStatus,
    refreshReactionBadges,
    dashboard,
  } = useTraining();
  const [kitColor, setKitColor] = useState(basePlayer.avatarColor);
  const [builderOpen, setBuilderOpen] = useState(false);
  const player = { ...basePlayer, avatarColor: kitColor };
  const personalEntries = entries.filter(
    (entry) => entry.playerId === currentPlayerID,
  );
  const teamName = session?.player?.teams[0]?.name ?? TEAM_NAME;

  return (
    <div className="page page--me">
      <header className="profile-hero">
        <Avatar player={player} size="large" />
        <div>
          <p className="eyebrow">Player profile</p>
          <h1>
            {player.firstName} {player.lastInitial}
          </h1>
          <p>{teamName}</p>
        </div>
        <button
          className="button button--outline"
          type="button"
          onClick={() => setBuilderOpen((open) => !open)}
        >
          {builderOpen ? "Close builder" : "Avatar builder"}
        </button>
        {connected ? (
          <button
            className="button button--outline"
            type="button"
            onClick={() => void signOut()}
          >
            Sign out
          </button>
        ) : null}
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
      <section
        className="card reaction-inbox"
        aria-labelledby="reaction-inbox-title"
      >
        <div className="section-heading">
          <div>
            <p className="eyebrow">From your teammates</p>
            <h2 id="reaction-inbox-title">Cheers for you</h2>
          </div>
          <span className="pill pill--lime">Private</span>
        </div>
        {reactionInboxStatus === "loading" ? (
          <p className="reaction-inbox__state">Loading your cheers…</p>
        ) : null}
        {reactionInboxStatus === "error" ? (
          <div className="reaction-inbox__state">
            <p>Your cheers could not be loaded.</p>
            <button
              type="button"
              className="button button--outline"
              onClick={() => void refreshReactionBadges()}
            >
              Try again
            </button>
          </div>
        ) : null}
        {reactionInboxStatus === "ready" && reactionBadges.length === 0 ? (
          <p className="reaction-inbox__state">
            Teammate cheers will appear here.
          </p>
        ) : null}
        {reactionBadges.length > 0 ? (
          <ul className="reaction-badge-list">
            {reactionBadges.map((badge) => (
              <li
                key={badge.id}
                className={`reaction-badge-list__item reaction-badge-list__item--${badge.context.type}`}
              >
                <span className="reaction-badge-list__emoji" aria-hidden="true">
                  {badge.emoji}
                </span>
                <div>
                  <span className="reaction-badge-list__context">
                    {reactionContextLabel(badge)}
                  </span>
                  <p>{badge.message}</p>
                </div>
              </li>
            ))}
          </ul>
        ) : null}
      </section>
      <section className="profile-grid">
        <article className="card profile-action">
          <span aria-hidden="true">▦</span>
          <div>
            <h2>Session history</h2>
            <p>
              {entriesStatus === "loading"
                ? "Loading your private sessions…"
                : `${personalEntries.length} private saved sessions`}
            </p>
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
            <p>
              {connected ? "Connected to your player login" : "Prototype mode"}
            </p>
          </div>
          <span className="pill">{connected ? "Connected" : "Prototype"}</span>
        </article>
      </section>
      <SessionList
        entries={personalEntries}
        activities={dashboard?.activities ?? []}
      />
      {entriesStatus === "error" ? (
        <div className="notice notice--error" role="alert">
          <strong>Your private sessions could not be loaded.</strong>
          <button type="button" onClick={() => void refreshEntries()}>
            Try again
          </button>
        </div>
      ) : null}
    </div>
  );
}

function reactionContextLabel(badge: ReactionBadge): string {
  if (badge.context.type === "challenge") {
    return badge.context.activityName
      ? `${badge.context.activityName} challenge`
      : copy.cheers.contextLabels.challenge;
  }
  return copy.cheers.contextLabels[badge.context.type];
}
