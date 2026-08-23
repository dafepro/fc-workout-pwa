export const playerExperienceCopy = {
  navigation: {
    label: "Primary navigation",
    today: "Today",
    team: "Team",
    me: "Me",
  },
  momentum: {
    eyebrow: "Your momentum",
    detail: {
      "warming-up": "Every plan-following day starts the rhythm.",
      building: "Your steady choices are adding up.",
      rolling: "You’ve found a steady rhythm.",
      strong: "Your consistent rhythm is holding strong.",
    },
  },
  today: {
    eyebrow: "Today",
    log: "Log today’s plan",
    logPreview: "Goal or Reach · Effort · Tiredness",
    completionTitle: "Today is in the books",
    completionBody: "Your participation star is ready in Team.",
    joinTeam: "Join Team lounge",
    lockedTeamTitle: "Team lounge",
    lockedTeamBody: "Complete today’s plan to join your team.",
    unlockedTeamBody:
      "Your team is ready. Add your star and make the canvas move.",
    why: "Why this plan?",
  },
  rewards: {
    eyebrow: "Team rewards coming soon",
    todayBody: "Show up together. Unlock something real.",
    teamBody: "Participation moves the whole team.",
    previewLabel: "Preview goal—not active yet",
    progress: "9 of 12 plan days",
  },
  previousViews: {
    eyebrow: "For comparison and review",
    title: "Previous views",
    body: "Open any earlier experience without changing the default view.",
  },
  devConsole: {
    title: "Experience dev console",
    summary: "Preview flags, visibility, and locked states",
    body: "These device-only presentation overrides never bypass server access or change saved training data.",
    momentumPreview: "Momentum preview",
    todayPreview: "Today preview",
    teamAccess: "Team access preview",
    showMomentum: "Show Momentum card",
    showRewards: "Show rewards preview",
    reset: "Reset dev controls",
    forcedLock: "Dev preview · locked presentation",
  },
} as const;
