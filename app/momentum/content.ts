export const momentumContent = {
  brand: "ZoomiGo",
  header: {
    eyebrow: "Product concept · Feedback round 1 applied",
    title: "Momentum design draft",
    intro:
      "A continuous training loop that makes today clear, lets challenge grow safely, and gives recovery the same dignity as work.",
    status: "Review prototype · No backend behavior",
  },
  tabs: {
    concept: "Design draft",
    demo: "Interactive demo",
  },
  definition: {
    title: "Revised working idea",
    lead: "Momentum is a continuous, personalized signal.",
    body: "Goal means complete. Stretch is optional. Momentum reflects a player’s recent pattern of following an appropriate plan—not lifetime points, total volume, or a plan with an end date.",
  },
  pillars: [
    {
      number: "01",
      title: "Personal next move",
      body: "Every visit starts with one coach-bounded suggestion and a short explanation of why it fits today.",
    },
    {
      number: "02",
      title: "Bounded growth",
      body: "Consistency can raise the next goal gradually. Stretch work adds only a small private lift.",
    },
    {
      number: "03",
      title: "Recovery belongs",
      body: "Rest and recovery are first-class plan choices, not empty days or broken progress.",
    },
    {
      number: "04",
      title: "Team, no standings",
      body: "Normalized participation creates team highlights without exposing targets, results, or player order.",
    },
  ],
  guardrailTitle: "Momentum contribution rules",
  guardrails: [
    {
      label: "Prescribed goal",
      detail: "Full personal movement and one normalized team contribution.",
    },
    {
      label: "Stretch target",
      detail: "Small private movement; never another team contribution.",
    },
    {
      label: "Approved alternative",
      detail:
        "Partial movement, unless it is a safety-equivalent substitution.",
    },
    {
      label: "Paired recovery",
      detail:
        "Supportive personal movement after demanding work; never another team contribution.",
    },
    {
      label: "Extra activity",
      detail: "Saved to personal history with little or no Momentum effect.",
    },
    {
      label: "Planned rest",
      detail:
        "Recorded with one tap, no result field, and no pressure to train.",
    },
  ],
  safety: {
    title: "Safety contract",
    points: [
      "A goal must be enough to feel complete; the interface never frames stretch as unfinished work.",
      "A hard session, an assessment, or high tiredness makes recovery the next suggestion.",
      "Momentum has named bands and a soft ceiling. It is never shown as 100% complete.",
      "Team surfaces receive only normalized participation, never raw performance or assessment data.",
      "The suggestion-engine concept is advisory, explainable, and constrained by coach-approved activities and workload bounds.",
      "Player-facing rest notes, photos, and uploads stay out of this draft while the product prohibits user-generated content.",
    ],
  },
  suggestion: {
    eyebrow: "Later system dependency",
    title: "Personalization is mocked, not implemented",
    body: "The prototype shows the output of a future suggestion engine so the Momentum experience can be reviewed now. That engine is adjacent to Momentum, but it should remain a separate service and product decision.",
    inputs: [
      "Coach-approved plan and activity constraints",
      "Recent consistency and completed goals",
      "Private tiredness and recent workload",
      "Recovery after demanding work",
      "Age-appropriate growth and deload bounds",
      "Combined load when a player belongs to more than one team",
    ],
    output:
      "Output: one recommended goal, one optional stretch target, and a plain-language reason.",
  },
  consolidation: [
    {
      current: "Weekly goal and streak cards",
      proposed: "One continuous Momentum signal plus recent-plan context",
    },
    {
      current: "Effort points",
      proposed: "Retire the lifetime total; keep reflection private",
    },
    {
      current: "Challenge and team-goal duplication",
      proposed: "Team plan pulse and rotating, unranked highlights",
    },
    {
      current: "Leaders destination",
      proposed: "Replace with Team highlights",
    },
    {
      current: "Generic record form",
      proposed:
        "Plan-specific goal, stretch, alternative, recovery, or rest check-in",
    },
  ],
  review: {
    title: "Decisions this round should answer",
    questions: [
      "Which gauge treatment feels motivating without looking like a score to maximize?",
      "Should an approved alternative contribute half of a normalized team unit, or only personal Momentum?",
      "What evidence and coach controls must exist before goals can grow with consistency?",
      "Should planned rest count in the team plan pulse exactly like a completed activity?",
      "Is structured, private rest tracking enough for the first release, with personal media and text deferred?",
    ],
    fullDraft:
      "The full rationale, feedback record, gaps, business rules, and rollout questions live in docs/MOMENTUM_CONCEPT.md.",
  },
  demo: {
    label: "Scenario-based review prototype",
    instruction:
      "Choose a scenario to compare the most important states without implying a fixed training-plan finish.",
    reset: "Reset scenario",
    phoneLabel: "Proposed player interface",
    player: "Mason C.",
    playerTeam: "Hill Striders",
    scenarios: [
      { id: "plan", label: "Personal plan" },
      { id: "stretch", label: "Goal + stretch" },
      { id: "alternative", label: "Different activity" },
      { id: "recovery", label: "Hard + recovery" },
      { id: "consistency", label: "Consistency growth" },
      { id: "rest", label: "Rest day" },
      { id: "gauges", label: "Gauge Lab" },
      { id: "team", label: "Team highlights" },
      { id: "extras", label: "Extra logs" },
    ],
    nav: ["Today", "Team", "Me"],
    gauge: {
      label: "Momentum",
      band: "Rolling",
      detail: "Your recent plan-following is steady",
      accessible: "Momentum is rolling — recent plan-following is steady",
    },
    plan: {
      kicker: "Built for your next step",
      title: "Today’s prescription",
      activity: "Hill sprints",
      duration: "About 12 min · demanding",
      instruction:
        "Sprint for 6 seconds, then walk back fully before the next start.",
      goal: "Goal · 8 reps",
      goalNote: "Completes today’s plan",
      stretch: "Stretch · 10 reps",
      stretchNote: "Optional only if you still feel smooth",
      reasonTitle: "Why this move?",
      reasons: [
        "Four steady check-ins",
        "Coach-approved sprint day",
        "Recovery is suggested next",
      ],
      action: "Start check-in",
      alternative: "Choose another approved activity",
    },
    stretch: {
      kicker: "Goal completed",
      title: "How far did you choose to go?",
      goalAction: "Goal reached",
      stretchAction: "Stretch reached",
      goalResult: "Full Momentum movement",
      stretchResult: "Small private boost",
      goalBody:
        "The goal completes today. Your normalized team contribution is one.",
      stretchBody:
        "The stretch adds a small private lift. Your team contribution stays at one.",
      closure: "You are done for today. Recovery comes next.",
    },
    alternative: {
      kicker: "Choice without pressure",
      title: "Choose an approved activity",
      prescribed: "Hill sprints",
      prescribedEffect: "Full Momentum movement",
      different: "Ball control circuit",
      differentEffect: "Partial Momentum movement",
      equivalent: "Low-impact sprint substitute",
      equivalentEffect: "Full movement when chosen for safety",
      note: "Different work still counts. Equivalent safety substitutions are not penalized.",
      action: "Choose ball control circuit",
      selected: "Alternative selected",
    },
    recovery: {
      kicker: "Demanding work closed",
      title: "Main work complete",
      body: "Today’s prescribed effort is finished. The app now offers only a low-effort companion activity.",
      suggestion: "Easy recovery walk",
      detail: "Relaxed pace · stop if anything hurts",
      action: "Log recovery walk",
      complete: "Recovery logged",
      effect: "Supportive Momentum only · no additional team contribution",
      closure: "No more demanding work is suggested today.",
    },
    consistency: {
      kicker: "Suggestion-engine preview",
      title: "Challenge grows carefully",
      steadyLabel: "Steady consistency",
      tiredLabel: "High tiredness",
      steadyTitle: "Hill sprints",
      steadyGoal: "Goal · 9 controlled reps",
      steadyBody: "One small step up after several completed goals.",
      tiredTitle: "Easy recovery",
      tiredGoal: "Goal · relaxed movement",
      tiredBody: "Tiredness overrides growth and lowers today’s load.",
      explanation:
        "Why: recent pattern + coach bounds + private recovery signal",
      disclaimer:
        "Illustrative recommendation only; no prediction engine is running.",
    },
    rest: {
      kicker: "Today’s prescribed choice",
      title: "Rest is today’s plan",
      body: "Recording rest protects the training rhythm without asking for a performance result.",
      action: "Record rest day",
      completeTitle: "Rest recorded",
      completeBody:
        "Your plan is complete for today. Nothing else is suggested.",
      reflection: "Optional private reflection",
      options: ["Feeling restored", "Still tired", "Prefer not to say"],
      privacy: "Structured and private. No text box, photo, or upload.",
    },
    gauges: {
      kicker: "Three visual directions",
      title: "Gauge Lab",
      body: "Each version shows a named state with a soft ceiling rather than a finish line.",
      options: [
        {
          name: "Momentum Trail",
          state: "Rolling",
          accessible: "Momentum Trail: Rolling",
          note: "Recommended: movement over time, with room ahead.",
        },
        {
          name: "Flow Bar",
          state: "Rolling",
          accessible: "Flow Bar: Rolling",
          note: "Clearest at a glance, but closest to a score bar.",
        },
        {
          name: "Orbit Gauge",
          state: "Rolling",
          accessible: "Orbit Gauge: Rolling",
          note: "Most distinctive, but may imply completion around a circle.",
        },
      ],
      bands: "Warming up · Building · Rolling · Strong",
    },
    team: {
      kicker: "Shared energy, private results",
      title: "Hill Striders highlights",
      pulseTitle: "Team plan pulse",
      pulseState: "The team is finding a steady rhythm",
      pulseBody:
        "Completed activity and planned rest both support the shared plan.",
      steadyTitle: "Steady strides",
      steadyBody:
        "Mason, Ari, Elena, and three teammates followed their plan recently.",
      challengeTitle: "Team challenge complete",
      challengeBody: "Players combined approved activity across several days.",
      cheerTitle: "Encouragement shared",
      cheerBody: "Five predefined cheers were sent after check-ins.",
      privacy: "Targets, results, assessments, and tiredness stay private.",
    },
    extras: {
      kicker: "Complete history, bounded reward",
      title: "Today’s activity log",
      rows: [
        {
          activity: "Prescribed goal",
          effect: "Full Momentum movement",
          status: "Plan complete",
        },
        {
          activity: "Recovery walk",
          effect: "Supportive movement",
          status: "Private only",
        },
        {
          activity: "Extra ball work",
          effect: "No Momentum change",
          status: "Saved to history",
        },
      ],
      action: "Record another approved activity",
      saved: "Extra activity saved to history",
      note: "Extra logging remains useful without turning volume into a way to farm Momentum.",
    },
  },
  rationale: {
    plan: [
      "The prominent trail makes Momentum feel ongoing, not finishable.",
      "Goal and stretch are visibly different promises.",
      "The recommendation explains itself without claiming certainty.",
    ],
    stretch: [
      "The goal earns the meaningful effect before stretch is considered.",
      "Stretch remains private and adds only a small bounded effect.",
      "Closure moves the player toward recovery instead of more volume.",
    ],
    alternative: [
      "Players keep agency when the prescription does not fit.",
      "A normal alternative gets partial recognition for plan alignment.",
      "A safety-equivalent substitution can receive full recognition.",
    ],
    recovery: [
      "Higher-load work creates a recovery recommendation, not another challenge.",
      "The paired recovery effect is supportive and private.",
      "The screen clearly closes demanding work for the day.",
    ],
    consistency: [
      "Growth is a future recommendation-system output, not a Momentum calculation.",
      "Tiredness can hold or lower load even after a consistent pattern.",
      "The player can see a short reason for the suggestion.",
    ],
    rest: [
      "Rest is an explicit plan state with a one-tap completion.",
      "No result is required and no training prompt remains.",
      "The prototype follows current structured-input safety rules.",
    ],
    gauges: [
      "All three concepts use words before visual intensity.",
      "None presents a perfect score or permanent total.",
      "Momentum Trail is the current recommendation for further testing.",
    ],
    team: [
      "The team sees a pulse and rotating highlights, never player performance.",
      "Personalized plans become comparable only as normalized participation.",
      "Planned rest can support the team without disclosing who rested.",
    ],
    extras: [
      "The activity history can be complete even when Momentum is capped.",
      "One primary plan event and one recovery event receive visible effects.",
      "More volume does not create public status or repeated team credit.",
    ],
  },
} as const;
