export type WhatsNextRecommendation =
  | "cooldown"
  | "recovery"
  | "lounge"
  | "all-set";

export type WhatsNextSecondaryAction = "lounge" | "additional-activity";

export interface WhatsNextDecisionInput {
  restDay: boolean;
  planComplete: boolean;
  cooldownComplete: boolean;
  teamAvailable: boolean;
  effort?: number | null;
  tiredness?: number | null;
}

export interface WhatsNextDecision {
  recommendation: WhatsNextRecommendation;
  secondary: WhatsNextSecondaryAction[];
  showCooldownStatus: boolean;
  showTeamLocked: boolean;
}

const HIGH_STRAIN_LEVEL = 6;

export function decideWhatsNext(
  input: WhatsNextDecisionInput,
): WhatsNextDecision {
  const showTeamLocked = !input.teamAvailable;
  const showCooldownStatus = !input.restDay && input.cooldownComplete;

  if (input.restDay) {
    return {
      recommendation: input.teamAvailable ? "lounge" : "all-set",
      secondary: [],
      showCooldownStatus: false,
      showTeamLocked,
    };
  }

  const highStrain =
    (input.effort ?? 0) >= HIGH_STRAIN_LEVEL ||
    (input.tiredness ?? 0) >= HIGH_STRAIN_LEVEL;

  if (highStrain && !input.cooldownComplete) {
    return {
      recommendation: "recovery",
      secondary: input.teamAvailable ? ["lounge"] : [],
      showCooldownStatus,
      showTeamLocked,
    };
  }

  if (!input.cooldownComplete) {
    return {
      recommendation: "cooldown",
      secondary: [
        ...(input.teamAvailable ? (["lounge"] as const) : []),
        "additional-activity",
      ],
      showCooldownStatus,
      showTeamLocked,
    };
  }

  return {
    recommendation: input.teamAvailable ? "lounge" : "all-set",
    secondary: ["additional-activity"],
    showCooldownStatus,
    showTeamLocked,
  };
}
