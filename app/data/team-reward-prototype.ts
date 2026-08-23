import {
  evaluateTeamReward,
  type TeamRewardProgressInput,
  type TeamRewardRule,
  validateTeamRewardRule,
} from "../domain/team-rewards";

export type PrototypeRewardStatus =
  | "draft"
  | "active"
  | "achieved"
  | "cancelled";

export interface PrototypeTeamReward {
  id: string;
  teamId: string;
  status: PrototypeRewardStatus;
  prizeTitle: string;
  prizeDescription: string;
  imageDataUrl?: string;
  startsOn: string;
  rule: TeamRewardRule;
  createdAt: string;
  updatedAt: string;
}

export const TEAM_REWARD_PROTOTYPE_EVENT = "zoomigo-team-reward-prototype";
const STORAGE_PREFIX = "zoomigo-team-rewards-prototype-v1:";
const prototypeInput: TeamRewardProgressInput = {
  days: [8, 8, 7, 9, 10, 6, 8, 8, 7, 9, 8, 5].map(
    (qualifyingPlayers, index) => ({
      date: `2026-08-${String(index + 10).padStart(2, "0")}`,
      activePlayers: 10,
      qualifyingPlayers,
    }),
  ),
  players: [4, 4, 3, 3, 2, 2, 1, 1, 0, 0].map((qualifyingDays, index) => ({
    playerId: `prototype-${index + 1}`,
    qualifyingDays,
  })),
};

export function prototypeRewardProgress(rule: TeamRewardRule) {
  return evaluateTeamReward(rule, prototypeInput);
}

function localDate(date: Date) {
  const offset = date.getTimezoneOffset() * 60_000;
  return new Date(date.getTime() - offset).toISOString().slice(0, 10);
}

export function createPrototypeReward(
  teamId: string,
  now = new Date(),
): PrototypeTeamReward {
  const timestamp = now.toISOString();
  return {
    id: `reward-${now.getTime()}-${Math.random().toString(36).slice(2, 8)}`,
    teamId,
    status: "draft",
    prizeTitle: "Team choice celebration",
    prizeDescription:
      "Choose a fun team activity together at the next session.",
    startsOn: localDate(now),
    rule: {
      version: 1,
      kind: "qualifying_team_days",
      requiredDays: 10,
      minimumRosterPercent: 80,
      participationScope: "recommended_workout",
    },
    createdAt: timestamp,
    updatedAt: timestamp,
  };
}

export function publishPrototypeReward(
  reward: PrototypeTeamReward,
  existing: PrototypeTeamReward[],
  now = new Date(),
): PrototypeTeamReward {
  const active = existing.find(
    (candidate) =>
      candidate.teamId === reward.teamId && candidate.status === "active",
  );
  if (active && active.id !== reward.id) {
    throw new Error("A team can have only one active reward.");
  }
  return { ...reward, status: "active", updatedAt: now.toISOString() };
}

export function cancelPrototypeReward(
  reward: PrototypeTeamReward,
  now = new Date(),
): PrototypeTeamReward {
  if (reward.status !== "active") {
    throw new Error("Only an active reward can be cancelled.");
  }
  return { ...reward, status: "cancelled", updatedAt: now.toISOString() };
}

function storageKey(teamId: string) {
  return `${STORAGE_PREFIX}${teamId}`;
}

export function prototypeRewardsSnapshot(
  teamId: string,
  storage: Pick<Storage, "getItem"> = window.localStorage,
): string {
  return storage.getItem(storageKey(teamId)) ?? "[]";
}

export function parsePrototypeRewards(
  teamId: string,
  snapshot: string,
): PrototypeTeamReward[] {
  try {
    const parsed = JSON.parse(snapshot);
    return Array.isArray(parsed)
      ? parsed.filter(
          (reward): reward is PrototypeTeamReward =>
            reward?.teamId === teamId &&
            typeof reward.id === "string" &&
            typeof reward.prizeTitle === "string" &&
            ["draft", "active", "achieved", "cancelled"].includes(
              reward.status,
            ) &&
            reward.rule &&
            validateTeamRewardRule(reward.rule).length === 0,
        )
      : [];
  } catch {
    return [];
  }
}

export function readPrototypeRewards(
  teamId: string,
  storage: Pick<Storage, "getItem"> = window.localStorage,
): PrototypeTeamReward[] {
  return parsePrototypeRewards(
    teamId,
    prototypeRewardsSnapshot(teamId, storage),
  );
}

export function writePrototypeRewards(
  teamId: string,
  rewards: PrototypeTeamReward[],
  storage: Pick<Storage, "setItem"> = window.localStorage,
) {
  try {
    storage.setItem(storageKey(teamId), JSON.stringify(rewards));
  } catch {
    // The prototype remains interactive when private browsing or quota blocks
    // persistence; the visible banner already says this is device-local data.
  }
  if (typeof window !== "undefined") {
    window.dispatchEvent(
      new CustomEvent(TEAM_REWARD_PROTOTYPE_EVENT, { detail: { teamId } }),
    );
  }
}

export function upsertPrototypeReward(
  rewards: PrototypeTeamReward[],
  reward: PrototypeTeamReward,
) {
  const withoutReward = rewards.filter(
    (candidate) => candidate.id !== reward.id,
  );
  return [reward, ...withoutReward];
}
