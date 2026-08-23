export type RewardParticipationScope =
  | "recommended_workout"
  | "any_approved_workout";

export type TeamRewardRule =
  | {
      version: 1;
      kind: "qualifying_team_days";
      requiredDays: number;
      minimumRosterPercent: number;
      participationScope: RewardParticipationScope;
    }
  | {
      version: 1;
      kind: "teammate_consistency";
      requiredPlayers: number;
      requiredDaysPerPlayer: number;
      participationScope: RewardParticipationScope;
    };

export interface RewardDayInput {
  date: string;
  activePlayers: number;
  qualifyingPlayers: number;
}

export interface RewardPlayerInput {
  playerId: string;
  qualifyingDays: number;
}

export interface TeamRewardProgressInput {
  days: RewardDayInput[];
  players: RewardPlayerInput[];
}

export interface RewardDayProgress extends RewardDayInput {
  requiredPlayers: number;
  qualifies: boolean;
}

export interface TeamRewardProgress {
  current: number;
  target: number;
  percent: number;
  close: boolean;
  achieved: boolean;
  days: RewardDayProgress[];
}

function wholeNumberBetween(value: number, minimum: number, maximum: number) {
  return Number.isInteger(value) && value >= minimum && value <= maximum;
}

export function validateTeamRewardRule(rule: TeamRewardRule): string[] {
  const errors: string[] = [];
  if (rule.version !== 1) errors.push("version");
  if (
    rule.participationScope !== "recommended_workout" &&
    rule.participationScope !== "any_approved_workout"
  ) {
    errors.push("participationScope");
  }

  if (rule.kind === "qualifying_team_days") {
    if (!wholeNumberBetween(rule.requiredDays, 1, 90)) {
      errors.push("requiredDays");
    }
    if (!wholeNumberBetween(rule.minimumRosterPercent, 10, 100)) {
      errors.push("minimumRosterPercent");
    }
  } else {
    if (!wholeNumberBetween(rule.requiredPlayers, 1, 100)) {
      errors.push("requiredPlayers");
    }
    if (!wholeNumberBetween(rule.requiredDaysPerPlayer, 1, 90)) {
      errors.push("requiredDaysPerPlayer");
    }
  }

  return errors;
}

function progressPercent(current: number, target: number) {
  if (target <= 0) return 0;
  return Math.min(100, Math.round((current / target) * 100));
}

export function evaluateTeamReward(
  rule: TeamRewardRule,
  input: TeamRewardProgressInput,
): TeamRewardProgress {
  if (validateTeamRewardRule(rule).length > 0) {
    throw new Error("Invalid team reward rule");
  }

  if (rule.kind === "qualifying_team_days") {
    const days = input.days.map((day) => {
      const requiredPlayers = Math.ceil(
        day.activePlayers * (rule.minimumRosterPercent / 100),
      );
      return {
        ...day,
        requiredPlayers,
        qualifies:
          day.activePlayers > 0 && day.qualifyingPlayers >= requiredPlayers,
      };
    });
    const current = Math.min(
      rule.requiredDays,
      days.filter((day) => day.qualifies).length,
    );
    const percent = progressPercent(current, rule.requiredDays);
    return {
      current,
      target: rule.requiredDays,
      percent,
      close: percent >= 80 && percent < 100,
      achieved: current >= rule.requiredDays,
      days,
    };
  }

  const current = Math.min(
    rule.requiredPlayers,
    input.players.filter(
      (player) => player.qualifyingDays >= rule.requiredDaysPerPlayer,
    ).length,
  );
  const percent = progressPercent(current, rule.requiredPlayers);
  return {
    current,
    target: rule.requiredPlayers,
    percent,
    close: percent >= 80 && percent < 100,
    achieved: current >= rule.requiredPlayers,
    days: [],
  };
}
