"use client";

import { useCallback, useMemo, useSyncExternalStore } from "react";

import {
  parsePrototypeRewards,
  prototypeRewardsSnapshot,
  TEAM_REWARD_PROTOTYPE_EVENT,
  writePrototypeRewards,
  type PrototypeTeamReward,
} from "./team-reward-prototype";

export function useTeamRewardPrototype(teamId: string) {
  const subscribe = useCallback(
    (notify: () => void) => {
      const handleChange = (event: Event) => {
        const changedTeam = (event as CustomEvent<{ teamId?: string }>).detail
          ?.teamId;
        if (!changedTeam || changedTeam === teamId) notify();
      };
      window.addEventListener(TEAM_REWARD_PROTOTYPE_EVENT, handleChange);
      window.addEventListener("storage", notify);
      return () => {
        window.removeEventListener(TEAM_REWARD_PROTOTYPE_EVENT, handleChange);
        window.removeEventListener("storage", notify);
      };
    },
    [teamId],
  );
  const snapshot = useSyncExternalStore(
    subscribe,
    () => prototypeRewardsSnapshot(teamId),
    () => "[]",
  );
  const rewards = useMemo(
    () => parsePrototypeRewards(teamId, snapshot),
    [snapshot, teamId],
  );

  const replace = useCallback(
    (next: PrototypeTeamReward[]) => {
      writePrototypeRewards(teamId, next);
    },
    [teamId],
  );

  return { rewards, replace };
}
