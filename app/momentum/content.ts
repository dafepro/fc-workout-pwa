export const momentumContent = {
  brand: "ZoomiGo",
  header: {
    eyebrow: "Momentum concept · Tightening pass",
    title: "Momentum, made simple",
    intro:
      "One daily path connects the right personal next step to safe, shared team energy.",
    status: "Review prototype · No backend behavior",
  },
  tabs: {
    concept: "Design brief",
    demo: "Player flow",
  },
  definition: {
    eyebrow: "The whole idea",
    title: "One flow. Two kinds of Momentum.",
    body: "Follow today’s plan to build personal Momentum. Completing the appropriate plan also adds one private, normalized lift to Team Momentum.",
    rule: "Goal means complete. Stretch is optional. Recovery and rest count as good plan-following.",
  },
  flow: [
    {
      number: "01",
      title: "See today",
      body: "One appropriate plan, one goal, and one optional stretch.",
    },
    {
      number: "02",
      title: "Check in",
      body: "Record the goal, stretch, or an approved alternative.",
    },
    {
      number: "03",
      title: "Close safely",
      body: "Demanding work leads to recovery, not another challenge.",
    },
    {
      number: "04",
      title: "Lift the Team",
      body: "Only normalized participation reaches the shared surface.",
    },
  ],
  momentumPair: [
    {
      label: "Personal Momentum",
      title: "Am I following the right plan for me?",
      body: "A continuous trail shaped by prescribed goals, optional stretch, recovery, and rest.",
      private: "Targets, results, effort, and tiredness stay private.",
    },
    {
      label: "Team Momentum",
      title: "Are we building a steady rhythm together?",
      body: "An aggregate pulse built from normalized plan-following across different personal plans.",
      private: "No standings, raw results, or public personal Momentum.",
    },
  ],
  folds: {
    eyebrow: "What was simplified",
    title: "Supporting ideas now live inside the flow",
    items: [
      {
        title: "Consistency",
        body: "Explains a small goal change inside Why this plan.",
      },
      {
        title: "Alternatives",
        body: "Open inline from today’s prescription and return to check-in.",
      },
      {
        title: "Recovery",
        body: "Appears automatically after the default demanding workout.",
      },
      {
        title: "Extra activity",
        body: "Remains a quiet private-history action after completion.",
      },
    ],
  },
  safety: {
    eyebrow: "Safety contract",
    title: "The flow stops reward from becoming pressure",
    points: [
      "The goal is a complete success; stretch adds only a small private lift.",
      "Hard work, assessment workload, or high tiredness promotes recovery.",
      "Extra activity can be saved, but it does not repeatedly move Momentum.",
      "Team sees normalized participation—never targets, results, assessments, or tiredness.",
      "Planned rest needs one tap, no result, no text, and no upload.",
    ],
  },
  review: {
    eyebrow: "Product-owner review",
    title: "Four decisions remain visible",
    questions: [
      "Does Momentum Trail feel motivating without becoming a score to maximize?",
      "Does partial recognition for an approved alternative preserve enough agency?",
      "Should planned rest add the same anonymous Team lift as completed training?",
      "Is the reason for a consistency-based goal change clear enough to earn trust?",
    ],
    fullDraft:
      "The full feedback record, ranked cuts, business rules, gaps, and rollout notes remain in docs/MOMENTUM_CONCEPT.md.",
  },
  demo: {
    eyebrow: "One connected review flow",
    instruction:
      "Follow the default training day from personal prescription to Team Momentum. Planned rest is the only alternate day state.",
    reset: "Start over",
    dayLabel: "Preview today",
    dayTraining: "Training day",
    dayRest: "Rest day",
    steps: ["Today", "Check in", "Done", "Team"],
    phoneLabel: "Proposed player Momentum flow",
    player: "Mason C.",
    team: "Hill Striders",
    nav: ["Today", "Team", "Me"],
    personalGauge: {
      label: "Personal Momentum",
      state: "Rolling",
      detail: "You’re following a steady rhythm",
      accessible: "Personal Momentum is rolling — a steady recent rhythm",
    },
    teamGauge: {
      label: "Team Momentum",
      state: "Building",
      detail: "More teammates are finding their rhythm",
      accessible:
        "Team Momentum is building — more teammates are finding their rhythm",
    },
    today: {
      kicker: "Chosen for your next step",
      title: "Today’s plan",
      activity: "Hill sprints",
      workload: "Demanding · recovery follows",
      instruction:
        "Sprint for 6 seconds, then walk back fully before the next start.",
      goal: "Goal · 8 reps",
      goalNote: "Completes today’s plan",
      stretch: "Stretch · 10 reps",
      stretchNote: "Optional if every rep still feels smooth",
      why: "Why this plan",
      reasons: [
        "Four recent goals support a careful one-rep step up.",
        "The coach-approved sprint plan sets today’s ceiling.",
        "Recovery follows demanding work before challenge grows again.",
      ],
      action: "Log today’s plan",
      alternative: "Choose another activity",
    },
    alternative: {
      kicker: "Stay in today’s flow",
      title: "Choose an approved alternative",
      intro: "Choose what fits today. The effect is clear before check-in.",
      options: [
        {
          title: "Ball control circuit",
          detail: "12 minutes · moderate",
          effect: "Partial Momentum",
        },
        {
          title: "Low-impact sprint substitute",
          detail: "8 controlled rounds · low impact",
          effect: "Full Momentum · safety equivalent",
        },
      ],
      back: "Back to today’s plan",
    },
    checkin: {
      kicker: "Quick check-in",
      title: "What did you complete?",
      goal: "Goal · 8 reps",
      stretch: "Stretch · 10 reps",
      alternateGoal: "Goal · 12 minutes",
      alternateStretch: "Stretch · 15 minutes",
      goalNote: "Complete",
      stretchNote: "Optional small private lift",
      feeling: "How do you feel now?",
      feelings: ["Good", "Tired", "Very tired"],
      privacy: "Your result and recovery signal stay private.",
      action: "Save check-in",
      back: "Back",
    },
    complete: {
      kicker: "Personal Momentum moved",
      title: "Main work complete",
      body: "You followed today’s plan and added one normalized lift to Team Momentum.",
      goalEffect: "Full movement for completing the goal",
      stretchEffect: "Small private lift for stretch",
      alternativeEffect: "Partial movement for an approved alternative",
      recoveryKicker: "The right next move",
      recoveryTitle: "Easy recovery walk",
      recoveryBody:
        "Relaxed pace. This supports recovery and adds no second Team lift.",
      recoveryAction: "Log recovery",
      recoveryLogged: "Recovery logged",
      teamAction: "See Team Momentum",
      finish: "Finish for today",
      extraSummary: "More activity",
      extraBody:
        "Additional approved work can be saved to private history with no Momentum change.",
    },
    rest: {
      kicker: "Today’s appropriate plan",
      title: "Rest is today’s plan",
      body: "Rest protects the rhythm. Recording it requires no performance result or explanation.",
      action: "Record rest day",
      completeKicker: "Personal Momentum held steady",
      completeTitle: "Rest recorded",
      completeBody: "Today’s plan is complete. Nothing else is suggested.",
      teamAction: "See Team Momentum",
      privacy: "Private, structured, and complete with one tap.",
    },
    teamView: {
      kicker: "Shared energy, private results",
      title: "Hill Striders Momentum",
      pulseTitle: "Steady together",
      pulseBody:
        "Eight teammates recently followed the plan that was right for them.",
      names: ["Mason", "Ari", "Elena", "Noah", "Zoe", "Lucas"],
      highlight: "Steady strides",
      highlightBody:
        "This group has followed several recent plan opportunities. Highlights rotate so more teammates can appear.",
      privacy: "No targets, results, tiredness, or ordered placement.",
      back: "Back to today",
    },
    notes: {
      today: [
        "The trail, goal, and primary action share one visual hierarchy.",
        "Consistency is an explanation, not another feature surface.",
        "Stretch and alternatives stay secondary but discoverable.",
      ],
      alternative: [
        "The player does not leave the daily loop to preserve agency.",
        "Effect language is visible before a choice is made.",
        "Safety-equivalent substitutions are not penalized.",
      ],
      checkin: [
        "Goal and stretch are the only result choices needed here.",
        "The private recovery signal can suppress later challenge.",
        "One save leads directly to closure.",
      ],
      complete: [
        "Personal and Team effects are explained together once.",
        "Demanding work naturally reveals recovery.",
        "Extra activity remains available without competing for attention.",
      ],
      rest: [
        "Rest uses the same Today hierarchy as training.",
        "There is no result, explanation requirement, or training prompt.",
        "The gauge holds steady without loss language.",
      ],
      team: [
        "Team Momentum reuses the trail language instead of adding a new metric.",
        "The surface shows aggregate rhythm and one rotating group.",
        "Personalized targets and results stay private.",
      ],
    },
  },
} as const;
