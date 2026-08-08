import { copy } from "../content/copy";
import type {
  TeamChallengeProjection,
  TeamMemberProjection,
} from "../domain/types";
import { Avatar } from "./Avatar";

interface TeamChallengeCardProps {
  challenge: TeamChallengeProjection | null;
  members: TeamMemberProjection[];
  currentPlayerID: string;
  onCheer: (player: TeamMemberProjection) => void;
}

export function TeamChallengeCard({
  challenge,
  members,
  currentPlayerID,
  onCheer,
}: TeamChallengeCardProps) {
  if (!challenge) {
    return (
      <section className="challenge-card challenge-card--empty">
        <div>
          <p className="eyebrow eyebrow--lime">{copy.social.teamChallenge}</p>
          <h2>{copy.social.noChallenge}</h2>
        </div>
        <span className="challenge-card__art" aria-hidden="true">
          ⚽
        </span>
      </section>
    );
  }

  return (
    <section className="challenge-card" aria-labelledby="team-challenge-title">
      <div>
        <p className="eyebrow eyebrow--lime">{copy.social.teamChallenge}</p>
        <h2 id="team-challenge-title">{challenge.activityName}</h2>
        <div className="challenge-card__meta">
          <span>
            {copy.social.challengeTarget(
              challenge.targetValue,
              challenge.targetUnit,
            )}
          </span>
          <span>{copy.social.challengeDue(formatDate(challenge.dueOn))}</span>
        </div>
        <strong className="challenge-card__count">
          <span aria-hidden="true">✓</span>
          {copy.social.challengeCount(challenge.completedCount, members.length)}
        </strong>
      </div>
      <div className="challenge-card__art" aria-hidden="true">
        🏃
      </div>
      <ul
        className="challenge-participants"
        aria-label={`${challenge.activityName} challenge progress`}
      >
        {members.map((player) => {
          const isCurrentPlayer = player.id === currentPlayerID;
          const content = (
            <>
              <span className="challenge-participant__avatar">
                <Avatar
                  player={player}
                  size="small"
                  completed={player.challengeCompleted}
                />
                {player.challengeCompleted ? (
                  <span
                    className="challenge-participant__check"
                    aria-hidden="true"
                  >
                    ✓
                  </span>
                ) : null}
              </span>
              <span>
                {isCurrentPlayer ? copy.social.you : player.firstName}
              </span>
              {!isCurrentPlayer && player.challengeCompleted ? (
                <small>{copy.social.cheer}</small>
              ) : null}
            </>
          );

          return (
            <li key={player.id}>
              {!isCurrentPlayer && player.challengeCompleted ? (
                <button
                  type="button"
                  aria-label={`Cheer for ${player.firstName} ${player.lastInitial} for completing ${challenge.activityName}`}
                  onClick={() => onCheer(player)}
                >
                  {content}
                </button>
              ) : (
                <div
                  className={
                    player.challengeCompleted ? "is-complete" : "is-pending"
                  }
                >
                  {content}
                </div>
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}

function formatDate(value: string): string {
  return new Intl.DateTimeFormat("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  }).format(new Date(`${value}T12:00:00Z`));
}
