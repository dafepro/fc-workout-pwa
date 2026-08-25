import { playerExperienceCopy } from "../content";
import { prototypeRewardProgress } from "../../data/team-reward-prototype";
import {
  reportPlayerTeamReward,
  usePlayerTeamReward,
} from "../../data/team-reward-gateway";
import { useTeamRewardPrototype } from "../../data/use-team-reward-prototype";
import { useOptionalAuth } from "../../state/auth-context";
import { usePlayerDevSettings } from "../dev/PlayerDevSettings";
import { TeamRewardCard } from "./TeamRewardCard";

export function TeamRewardsPreview({
  placement,
}: {
  placement: "today" | "team";
}) {
  const dev = usePlayerDevSettings();
  const auth = useOptionalAuth();
  const teamId = auth?.currentTeamID ?? "team-hill-striders";
  const prototype = useTeamRewardPrototype(teamId);
  const connected = usePlayerTeamReward(teamId, auth?.connected ?? false);
  if (!dev.settings.rewardsVisible) return null;
  if (auth?.connected) {
    if (!connected.reward) return null;
    return (
      <TeamRewardCard
        reward={connected.reward}
        progress={connected.reward.progress}
        placement={placement}
        onReport={(reason) =>
          reportPlayerTeamReward(teamId, connected.reward!.id, reason)
        }
      />
    );
  }
  const active = dev.enabled
    ? prototype.rewards.find((reward) => reward.status === "active")
    : undefined;
  if (active) {
    return (
      <TeamRewardCard
        reward={active}
        progress={prototypeRewardProgress(active.rule)}
        placement={placement}
      />
    );
  }
  const copy = playerExperienceCopy.rewards;
  return (
    <section
      className={`player-rewards player-rewards--${placement}`}
      aria-labelledby={`player-rewards-${placement}`}
    >
      <div>
        <p className="player-eyebrow" id={`player-rewards-${placement}`}>
          {copy.eyebrow}
        </p>
        {placement === "today" ? (
          <p>{copy.todayBody}</p>
        ) : (
          <>
            <strong>{copy.progress}</strong>
            <div
              className="player-rewards__progress"
              role="progressbar"
              aria-label="Preview team participation"
              aria-valuemin={0}
              aria-valuemax={12}
              aria-valuenow={9}
            >
              <span />
            </div>
            <p>{copy.teamBody}</p>
          </>
        )}
        <small>{copy.previewLabel}</small>
      </div>
      <span
        className="player-rewards__mark"
        data-testid="reward-mark"
        aria-hidden="true"
      >
        <i>?</i>
      </span>
    </section>
  );
}
