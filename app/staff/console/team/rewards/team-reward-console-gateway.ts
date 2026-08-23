import type {
  PrototypeTeamReward,
  RewardMediaAltKind,
} from "../../../../data/team-reward-prototype";
import type { TeamRewardProgress } from "../../../../domain/team-rewards";
import { ConsoleError, consoleFormRequest, consoleRequest } from "../../api";

export interface StaffTeamReward extends PrototypeTeamReward {
  progress: TeamRewardProgress;
}

export interface StaffTeamRewardsResponse {
  items: StaffTeamReward[];
}

interface UploadedRewardMedia {
  id: string;
  altKind: RewardMediaAltKind;
}

export async function createAndPublishTeamReward(
  teamId: string,
  draft: PrototypeTeamReward,
): Promise<StaffTeamReward> {
  const media = draft.imageDataUrl
    ? await uploadTeamRewardMedia(
        teamId,
        draft.imageDataUrl,
        draft.imageAltKind ?? "prize_image",
      )
    : null;
  const created = await consoleRequest<PrototypeTeamReward>(
    `v1/staff/teams/${teamId}/rewards`,
    {
      method: "POST",
      body: {
        prizeTitle: draft.prizeTitle,
        prizeDescription: draft.prizeDescription,
        startsOn: draft.startsOn,
        rule: draft.rule,
        mediaId: media?.id,
      },
    },
  );
  const publishPath = `v1/staff/teams/${teamId}/rewards/${created.id}/publish`;
  try {
    return await consoleRequest<StaffTeamReward>(publishPath, {
      method: "POST",
    });
  } catch (error) {
    if (!transientPublishError(error)) throw error;
    return recoverPublishHandoff(teamId, created.id, publishPath, error);
  }
}

async function recoverPublishHandoff(
  teamId: string,
  rewardId: string,
  publishPath: string,
  originalError: unknown,
) {
  let rewards: StaffTeamRewardsResponse;
  try {
    rewards = await consoleRequest<StaffTeamRewardsResponse>(
      `v1/staff/teams/${teamId}/rewards`,
    );
  } catch {
    throw originalError;
  }
  const reward = rewards.items.find((item) => item.id === rewardId);
  if (reward?.status === "active" || reward?.status === "achieved") {
    return reward;
  }
  if (reward?.status === "draft") {
    return consoleRequest<StaffTeamReward>(publishPath, { method: "POST" });
  }
  throw originalError;
}

function transientPublishError(error: unknown) {
  return (
    error instanceof ConsoleError && (error.status === 0 || error.status >= 500)
  );
}

export function withStaffRewardImageURL<T extends PrototypeTeamReward>(
  teamId: string,
  reward: T,
): T {
  return reward.mediaId
    ? {
        ...reward,
        imageUrl: `/staff/api/backend/v1/staff/teams/${encodeURIComponent(teamId)}/reward-media/${encodeURIComponent(reward.mediaId)}?variant=thumbnail`,
      }
    : reward;
}

async function uploadTeamRewardMedia(
  teamId: string,
  dataUrl: string,
  altKind: RewardMediaAltKind,
) {
  const form = new FormData();
  const blob = rewardImageBlob(dataUrl);
  form.append("altKind", altKind);
  form.append("image", blob, "reward-image");
  return consoleFormRequest<UploadedRewardMedia>(
    `v1/staff/teams/${teamId}/reward-media`,
    form,
  );
}

function rewardImageBlob(dataUrl: string) {
  const match = /^data:(image\/(?:png|jpeg));base64,([A-Za-z0-9+/=]+)$/.exec(
    dataUrl,
  );
  if (!match) throw new Error("The selected reward image is invalid.");
  const binary = atob(match[2]);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index++) {
    bytes[index] = binary.charCodeAt(index);
  }
  return new Blob([bytes], { type: match[1] });
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
