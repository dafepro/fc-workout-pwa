import Image from "next/image";

import {
  teamRewardCopy,
  teamRewardGoalCopy,
  teamRewardProgressCopy,
} from "../../content/team-rewards";
import type { PrototypeRewardStatus } from "../../data/team-reward-prototype";
import type { TeamRewardProgress } from "../../domain/team-rewards";
import type { TeamRewardRule } from "../../domain/team-rewards";

export function TeamRewardCard({
  reward,
  progress,
  placement,
}: {
  reward: {
    id: string;
    status: PrototypeRewardStatus;
    prizeTitle: string;
    prizeDescription: string;
    imageDataUrl?: string;
    rule: TeamRewardRule;
  };
  progress: TeamRewardProgress;
  placement: "today" | "team" | "preview";
}) {
  const headingId = `team-reward-${placement}-${reward.id}`;
  const achieved = reward.status === "achieved" || progress.achieved;
  return (
    <section
      className={`player-rewards player-rewards--active player-rewards--${placement}`}
      aria-labelledby={headingId}
    >
      <div className="player-rewards__content">
        <p className="player-eyebrow">{teamRewardCopy.eyebrow}</p>
        <strong id={headingId}>{reward.prizeTitle}</strong>
        {reward.prizeDescription ? <p>{reward.prizeDescription}</p> : null}
        <p className="player-rewards__goal">
          {teamRewardGoalCopy(reward.rule)}
        </p>
        <b>
          {teamRewardProgressCopy(
            reward.rule,
            progress.current,
            progress.target,
          )}
        </b>
        <div
          className="player-rewards__progress"
          role="progressbar"
          aria-label={teamRewardProgressCopy(
            reward.rule,
            progress.current,
            progress.target,
          )}
          aria-valuemin={0}
          aria-valuemax={progress.target}
          aria-valuenow={Math.min(progress.current, progress.target)}
        >
          <span style={{ width: `${progress.percent}%` }} />
        </div>
        {achieved ? (
          <p className="player-rewards__complete">
            <strong>{teamRewardCopy.achieved}</strong>
            {teamRewardCopy.achievedBody}
          </p>
        ) : null}
      </div>
      <div className="player-rewards__visual">
        {reward.imageDataUrl ? (
          <Image
            src={reward.imageDataUrl}
            alt={teamRewardCopy.staff.imageAlt(reward.prizeTitle)}
            width={240}
            height={180}
            unoptimized
          />
        ) : (
          <span className="player-rewards__gift" aria-hidden="true">
            <i />
          </span>
        )}
      </div>
    </section>
  );
}
