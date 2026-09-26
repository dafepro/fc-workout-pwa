"use client";
import { qualityCopy } from "../content/quality-copy";

import Link from "next/link";
import { InstallHelp } from "../player/PwaStatus";
import { PlayerAvatar } from "../components/PlayerAvatar";
import { SessionList } from "../components/SessionList";
import { TransientQueryToast } from "../components/TransientQueryToast";
import { copy } from "../content/copy";
import { LoadError } from "../components/LoadError";
import { routes } from "../content/routes";
import type { ReactionBadge } from "../domain/types";
import { useTraining } from "../state/training-context";
import { useAuth } from "../state/auth-context";
import { useAnalytics } from "../../lib/analytics/AnalyticsProvider";

export default function MePage() {
  const analytics = useAnalytics();
  const {
    connected,
    signOut,
    currentPlayer: player,
    currentPlayerID,
    runtime,
  } = useAuth();
  const {
    entries,
    entriesStatus,
    refreshEntries,
    reactionBadges,
    reactionInboxStatus,
    reactionInboxHasMore,
    reactionInboxMoreStatus,
    refreshReactionBadges,
    loadMoreReactionBadges,
    dashboard,
  } = useTraining();
  const personalEntries = entries.filter(
    (entry) => entry.playerId === currentPlayerID,
  );
  const teamName = runtime.currentTeam.name;

  return (
    <div className="page page--me">
      <TransientQueryToast
        parameter="avatar"
        value="saved"
        message={copy.avatar.saveSuccess}
      />
      <header className="profile-hero">
        <PlayerAvatar player={player} size="large" emphasizeSelf={false} />
        <div>
          <p className="eyebrow">Player profile</p>
          <h1>
            {player.firstName} {player.lastInitial}
          </h1>
          <p>{teamName}</p>
        </div>
        <Link
          className="button button--outline"
          href={routes.playerAvatar}
          onClick={() => analytics.track("avatar_builder_opened", {})}
        >
          {copy.avatar.open}
        </Link>
      </header>
      {entriesStatus === "loading" ? (
        <p role="status">{copy.recovery.historyLoading}</p>
      ) : null}
      {entriesStatus === "error" ? (
        <LoadError
          message={copy.recovery.historyFailed}
          onRetry={() => void refreshEntries()}
        />
      ) : null}
      {entriesStatus === "ready" || personalEntries.length > 0 ? (
        <SessionList
          entries={personalEntries}
          activities={dashboard?.activities ?? []}
        />
      ) : null}
      <section
        className="card reaction-inbox"
        aria-labelledby="reaction-inbox-title"
      >
        <div className="section-heading">
          <div>
            <p className="eyebrow">{copy.cheers.inboxEyebrow}</p>
            <h2 id="reaction-inbox-title">{copy.cheers.inboxTitle}</h2>
          </div>
          <span className="pill pill--lime">{copy.cheers.inboxPrivate}</span>
        </div>
        {reactionInboxStatus === "loading" ? (
          <p className="reaction-inbox__state">{copy.cheers.inboxLoading}</p>
        ) : null}
        {reactionInboxStatus === "error" ? (
          <div className="reaction-inbox__state">
            <p>{copy.cheers.inboxFailed}</p>
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
          <p className="reaction-inbox__state">{copy.cheers.inboxEmpty}</p>
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
        {reactionInboxMoreStatus === "error" ? (
          <p className="reaction-inbox__more-error" role="alert">
            {copy.cheers.moreFailed}
          </p>
        ) : null}
        {reactionInboxHasMore ? (
          <button
            type="button"
            className="reaction-inbox__more"
            disabled={reactionInboxMoreStatus === "loading"}
            onClick={() => void loadMoreReactionBadges()}
          >
            <span aria-hidden="true">✨</span>
            {reactionInboxMoreStatus === "loading"
              ? copy.cheers.loadingMore
              : copy.cheers.more}
          </button>
        ) : null}
      </section>
      <details className="card account-details">
        <summary>{qualityCopy.account}</summary>
        <p>{qualityCopy.accountHelp}</p>
        <InstallHelp />
        {connected ? (
          <button
            className="button button--outline"
            type="button"
            onClick={() => void signOut()}
          >
            Sign out
          </button>
        ) : null}
      </details>
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
