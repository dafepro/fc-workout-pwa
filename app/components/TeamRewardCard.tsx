import { copy } from "../content/copy";
import type { TeamRewardProjection } from "../domain/types";
import { ProgressBar } from "./ProgressBar";

export function TeamRewardCard({ reward }: { reward: TeamRewardProjection }) {
  const achieved = reward.status === "achieved" || reward.progress.achieved;
  return (
    <section
      className={`card team-reward-card${achieved ? " is-achieved" : ""}`}
      aria-labelledby="team-reward-title"
    >
      <div className="team-reward-card__art" aria-hidden="true">
        {rewardArtwork(reward.artworkId)}
      </div>
      <div className="team-reward-card__body">
        <p className="eyebrow eyebrow--lime">{copy.teamReward.eyebrow}</p>
        <h2 id="team-reward-title">{reward.title}</h2>
        <p>{reward.description}</p>
        <div className="team-reward-card__progress-copy">
          <strong>
            {achieved
              ? copy.teamReward.achieved
              : copy.teamReward.progress(
                  reward.progress.current,
                  reward.progress.target,
                )}
          </strong>
          <span>
            {copy.teamReward.through(formatRewardDate(reward.endsOn))}
          </span>
        </div>
        <ProgressBar
          value={reward.progress.current}
          max={reward.progress.target}
          tone={achieved ? "lime" : "purple"}
          label={copy.teamReward.progressLabel}
        />
      </div>
    </section>
  );
}

function rewardArtwork(artworkID: string) {
  return artworkID === "celebration-stars" ? "✦ ✨ ✦" : "✦";
}

function formatRewardDate(value: string): string {
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  }).format(new Date(`${value}T12:00:00Z`));
}
