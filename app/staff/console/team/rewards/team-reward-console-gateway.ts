import type { PrototypeTeamReward } from "../../../../data/team-reward-prototype";
import type { TeamRewardProgress } from "../../../../domain/team-rewards";
import { consoleRequest } from "../../api";

export interface StaffTeamReward extends PrototypeTeamReward {
  progress: TeamRewardProgress;
}

export interface StaffTeamRewardsResponse {
  items: StaffTeamReward[];
}

export async function createAndPublishTeamReward(
  teamId: string,
  draft: PrototypeTeamReward,
): Promise<StaffTeamReward> {
  const created = await consoleRequest<PrototypeTeamReward>(
    `v1/staff/teams/${teamId}/rewards`,
    {
      method: "POST",
      body: {
        prizeTitle: draft.prizeTitle,
        prizeDescription: draft.prizeDescription,
        startsOn: draft.startsOn,
        rule: draft.rule,
      },
    },
  );
  return consoleRequest<StaffTeamReward>(
    `v1/staff/teams/${teamId}/rewards/${created.id}/publish`,
    { method: "POST" },
  );
}

export function cancelConnectedTeamReward(
  teamId: string,
  rewardId: string,
): Promise<StaffTeamReward> {
  return consoleRequest<StaffTeamReward>(
    `v1/staff/teams/${teamId}/rewards/${rewardId}/cancel`,
    { method: "POST" },
  );
}
