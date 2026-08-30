import { ProgressBar } from "../components/ProgressBar";
import { copy } from "../content/copy";
import type { TeamHubFocus } from "../domain/types";

export function TeamWeekFocus({ focus }: { focus: TeamHubFocus[] }) {
  return (
    <section
      className="team-hub-card team-week-focus"
      aria-labelledby="team-week-title"
    >
      <header className="team-hub-card__heading">
        <div>
          <p className="eyebrow">{copy.teamHub.weekEyebrow}</p>
          <h2 id="team-week-title">{copy.teamHub.weekTitle}</h2>
        </div>
        <span className="team-week-focus__dates">
          {shortDate(focusDate(focus))}
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
                    ? copy.teamHub.reward
                    : copy.teamHub.challenge}
                </span>
                <strong>{item.title}</strong>
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
    return copy.teamHub.through(formatDate(item.endsOn));
  }
  if (item.kind === "challenge" && item.dueOn) {
    return copy.teamHub.due(formatDate(item.dueOn));
  }
  return "";
}

function focusDate(focus: TeamHubFocus[]): string | undefined {
  return focus.find((item) => item.dueOn)?.dueOn ?? focus[0]?.endsOn;
}

function shortDate(value: string | undefined): string {
  return value ? formatDate(value) : "";
}

function formatDate(value: string): string {
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  }).format(new Date(`${value}T12:00:00Z`));
}
