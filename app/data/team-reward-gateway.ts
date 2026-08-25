"use client";

import { useEffect, useState } from "react";

import type { PrototypeRewardStatus } from "./team-reward-prototype";
import {
  validateTeamRewardRule,
  type TeamRewardProgress,
  type TeamRewardRule,
} from "../domain/team-rewards";

export interface PlayerTeamReward {
  id: string;
  teamId: string;
  status: PrototypeRewardStatus;
  prizeTitle: string;
  prizeDescription: string;
  startsOn: string;
  rule: TeamRewardRule;
  progress: TeamRewardProgress;
  mediaId?: string;
  imageAlt?: string;
  imageUrl?: string;
}

export type TeamRewardReportReason =
  | "personal_information"
  | "inappropriate_content"
  | "wrong_team";

export async function reportPlayerTeamReward(
  teamId: string,
  rewardId: string,
  reason: TeamRewardReportReason,
) {
  const response = await fetch(
    `/api/zoomigo/v1/teams/${encodeURIComponent(teamId)}/rewards/${encodeURIComponent(rewardId)}/reports`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ reason }),
    },
  );
  if (response.status === 409) return;
  if (!response.ok) throw new Error("The concern could not be sent.");
}

export async function loadPlayerTeamReward(
  teamId: string,
): Promise<PlayerTeamReward | null> {
  const response = await fetch(
    `/api/zoomigo/v1/teams/${encodeURIComponent(teamId)}/reward`,
    { cache: "no-store" },
  );
  if (response.status === 204) return null;
  if (!response.ok) throw new Error("The team reward could not be loaded.");
  const reward = (await response.json()) as PlayerTeamReward;
  if (
    !reward ||
    typeof reward.id !== "string" ||
    reward.teamId !== teamId ||
    typeof reward.prizeTitle !== "string" ||
    !reward.rule ||
    validateTeamRewardRule(reward.rule).length > 0 ||
    !reward.progress ||
    typeof reward.progress.percent !== "number" ||
    (reward.mediaId !== undefined &&
      (typeof reward.mediaId !== "string" ||
        typeof reward.imageAlt !== "string"))
  ) {
    throw new Error("The team reward response was invalid.");
  }
  return reward.mediaId
    ? {
        ...reward,
        imageUrl: `/api/zoomigo/v1/teams/${encodeURIComponent(teamId)}/reward-media/${encodeURIComponent(reward.mediaId)}?variant=thumbnail`,
      }
    : reward;
}

export function usePlayerTeamReward(teamId: string, connected: boolean) {
  const key = `${connected}:${teamId}`;
  const [settled, setSettled] = useState<{
    key: string;
    reward: PlayerTeamReward | null;
    error: boolean;
  } | null>(null);

  useEffect(() => {
    if (!connected) return;
    let active = true;
    void loadPlayerTeamReward(teamId).then(
      (reward) => active && setSettled({ key, reward, error: false }),
      () => active && setSettled({ key, reward: null, error: true }),
    );
    return () => {
      active = false;
    };
  }, [connected, key, teamId]);

  const fresh = settled?.key === key;
  return {
    reward: fresh ? settled.reward : null,
    loading: connected && !fresh,
    error: fresh && settled.error,
  };
}
