import type {
  RewardParticipationScope,
  TeamRewardRule,
} from "../domain/team-rewards";

const participation = {
  recommended_workout: "logs their recommended workout",
  any_approved_workout: "logs an approved workout",
} satisfies Record<RewardParticipationScope, string>;

export function teamRewardGoalCopy(rule: TeamRewardRule) {
  if (rule.kind === "qualifying_team_days") {
    return `${rule.minimumRosterPercent}% of the team ${participation[rule.participationScope]} on ${rule.requiredDays} team days.`;
  }
  return `${rule.requiredPlayers} teammates each ${participation[rule.participationScope]} on ${rule.requiredDaysPerPlayer} days.`;
}

export function teamRewardProgressCopy(
  rule: TeamRewardRule,
  current: number,
  target: number,
) {
  if (rule.kind === "qualifying_team_days") {
    return `${current} of ${target} team days`;
  }
  return `${current} of ${target} teammates`;
}

export const teamRewardCopy = {
  eyebrow: "Team reward",
  active: "Active reward",
  achieved: "Goal reached!",
  achievedBody: "Your coach knows. Keep an eye out for what comes next.",
  staff: {
    title: "Team rewards",
    intro:
      "Set one clear participation goal and show the team the real-world prize they are working toward together.",
    prototypeLabel: "Prototype data",
    prototypeBody:
      "This dev-only preview stays on this browser. Its progress is illustrative and it does not read or change workouts.",
    emptyTitle: "No active team reward",
    emptyBody:
      "Create a guided goal, check the player view, then publish it for this prototype browser.",
    create: "Create a team reward",
    draft: "Reward setup",
    prizeName: "Prize name",
    prizeDescription: "What players should know",
    prizeImage: "Prize image (optional prototype preview)",
    imageHint: "PNG or JPEG, up to 750 KB in this device-only prototype.",
    connectedImageHint:
      "Prize image storage is the next backend slice. Text and progress publish now.",
    imageTooLarge: "Choose an image smaller than 750 KB.",
    imageWrongType: "Choose a PNG or JPEG image.",
    goalType: "How should the team earn it?",
    templates: {
      teamDays: "Qualifying team days",
      teamDaysHint:
        "A day counts when enough of that day's active roster participates.",
      consistency: "Teammate consistency",
      consistencyHint:
        "The reward completes when enough teammates each reach the day target.",
    },
    participation: "What counts as participation?",
    recommended: "Recommended workout",
    anyApproved: "Any approved workout",
    requiredDays: "Qualifying team days",
    rosterPercent: "Minimum active roster percentage",
    requiredPlayers: "Number of teammates",
    daysPerPlayer: "Days per teammate",
    startsOn: "Start date",
    preview: "Player card preview",
    publish: "Publish reward",
    discard: "Discard draft",
    cancel: "Cancel reward",
    cancelQuestion:
      "Cancel this reward? Players will stop seeing it, but the staff record stays here.",
    cancelConfirm: "Yes, cancel reward",
    cancelled: "Cancelled reward",
    cancelledBody:
      "This record is kept for staff context and no longer appears to players.",
    progressTitle: "Team progress",
    progressHint:
      "Player cards stay aggregate. Staff can use this progress to see how the team is moving toward the goal.",
    recentDays: "Recent team days",
    dayProgress: (participated: number, active: number, required: number) =>
      `${participated} of ${active} participated · ${required} needed`,
    dayCounted: "Counted",
    dayNotCounted: "Not yet",
    imageAlt: (title: string) => `Prize preview for ${title}`,
  },
} as const;
