export const momentumAlphaMock = {
  player: {
    firstName: "Mason",
    lastInitial: "C.",
    team: "Hill Striders",
    initials: "MC",
  },
  plan: {
    dateLabel: "Today · Aug 20",
    activity: "Hill Sprints",
    workload: "Demanding · recovery follows",
    instruction:
      "Sprint for 6 seconds, then walk back fully before the next start.",
    goal: "Goal · 8 reps",
    stretch: "Stretch · 10 reps",
    reasons: [
      "Four recent goals support a careful one-rep step up.",
      "The coach-approved sprint plan sets today’s ceiling.",
      "Recovery follows demanding work before challenge grows again.",
    ],
  },
  alternatives: [
    {
      id: "ball-control" as const,
      title: "Ball control circuit",
      detail: "12 minutes · moderate",
      effect: "Partial Momentum",
      goal: "Goal · 12 minutes",
      stretch: "Stretch · 15 minutes",
    },
    {
      id: "low-impact" as const,
      title: "Low-impact sprint substitute",
      detail: "8 controlled rounds · low impact",
      effect: "Full Momentum · safety equivalent",
      goal: "Goal · 8 rounds",
      stretch: "Stretch · 10 rounds",
    },
  ],
  recovery: {
    title: "Easy recovery walk",
    detail: "10 minutes · relaxed pace",
  },
  extras: [
    { id: "ball-control" as const, label: "Easy ball touches · 10 minutes" },
    { id: "easy-walk" as const, label: "Easy walk · 15 minutes" },
    { id: "mobility" as const, label: "Mobility routine · 8 minutes" },
  ],
} as const;
