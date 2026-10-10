import { ProgressBar } from "../components/ProgressBar";
import { useId } from "react";
import { copy } from "../content/copy";
import { qualityCopy } from "../content/quality-copy";
import type { TeamHubFocus } from "../domain/types";

export function TeamWeekFocus({
  focus,
  weekStart,
  weekEnd,
}: {
  focus: TeamHubFocus[];
  weekStart?: string;
  weekEnd?: string;
}) {
  const titleId = useId();
  return (
    <section
      className="team-hub-card team-week-focus"
      aria-labelledby={titleId}
    >
      <header className="team-hub-card__heading">
        <div>
          <p className="eyebrow">{copy.teamHub.weekEyebrow}</p>
          <h2 id={titleId}>
            {weekStart ? copy.teamHub.weekTitle : qualityCopy.rewardHistory}
          </h2>
        </div>
        <span className="team-week-focus__dates">
          {weekStart && weekEnd
            ? `${formatDate(weekStart)} – ${formatDate(weekEnd)}`
            : ""}
        </span>
      </header>
      {focus.length === 0 ? (
        <p className="team-hub-card__empty">{copy.teamHub.weekEmpty}</p>
      ) : (
        <div className="team-week-focus__rows">
          {focus.map((item) => (
            <article
              className={`team-week-focus__row team-week-focus__row--${item.kind}`}
              key={`${item.kind}-${item.id}`}
            >
              <span className="team-week-focus__icon" aria-hidden="true">
                {item.kind === "reward" ? "✦" : "⚡"}
              </span>
              <div className="team-week-focus__body">
                <span className="team-week-focus__kind">
                  {item.kind === "reward"
                    ? `${copy.teamHub.reward} · ${qualityCopy.rewardStates[item.state ?? "current"]}`
                    : copy.teamHub.challenge}
                </span>
                <strong>{item.title}</strong>
                {item.kind === "reward" && item.minimumRosterPercent ? (
                  <p>{qualityCopy.rewardRule(item.minimumRosterPercent)}</p>
                ) : null}
                {item.kind === "reward" && item.imageUrl ? (
                  // The private route needs the signed-in browser's player cookie.
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    className="team-week-focus__reward-image"
                    src={item.imageUrl}
                    alt="Prize for the team"
                  />
                ) : null}
                {item.kind === "reward" && item.description ? (
                  <p>{item.description}</p>
                ) : null}
                <div className="team-week-focus__progress-copy">
                  <span>{progressCopy(item)}</span>
                  <small>{dateCopy(item)}</small>
                </div>
                <ProgressBar
                  value={item.current}
                  max={item.target}
                  tone={item.kind === "reward" ? "purple" : "lime"}
                  label={`${item.title} progress`}
                />
              </div>
            </article>
          ))}
        </div>
      )}
    </section>
  );
}

function progressCopy(item: TeamHubFocus): string {
  return item.kind === "reward"
    ? copy.teamHub.rewardProgress(item.current, item.target)
    : copy.teamHub.challengeProgress(item.current, item.target);
}

function dateCopy(item: TeamHubFocus): string {
  if (item.kind === "reward" && item.endsOn) {
    if (item.state === "ended")
      return qualityCopy.ended(formatDate(item.endsOn));
    if (item.state === "upcoming" && item.startsOn)
      return qualityCopy.starts(formatDate(item.startsOn));
    return copy.teamHub.through(formatDate(item.endsOn));
  }
  if (item.kind === "challenge" && item.dueOn) {
    return copy.teamHub.due(formatDate(item.dueOn));
  }
  return "";
}

function formatDate(value: string): string {
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  }).format(new Date(`${value}T12:00:00Z`));
}
