export const copy = {
  brand: "ZoomiGo",
  tagline: "Show up. Build your stride.",
  safeSocial: "Team views celebrate participation—not speed or scores.",
  saveSuccess: "Training saved",
  completion: {
    eyebrow: "Workout complete",
    title: "Done for today!",
    activity: (activityName: string) => `${activityName} complete`,
    teamContribution: (teamName: string) =>
      `Nice work—your effort helped ${teamName} move forward.`,
    action: "See team progress",
  },
  streakQuips: [
    "If each streak day were a hammerhead shark, your streak would be {value} feet long!",
    "If each streak day were a soccer ball, your streak would stretch {value} feet!",
    "If each streak day were a giant taco, you would have a {value}-foot snack tower!",
  ],
  feelingQuestions: {
    effort: "How hard did you work?",
    exhaustion: "How tired were you after?",
  },
  intensityValues: {
    effort: [
      "Super easy",
      "Easy",
      "Moderate",
      "Getting hard",
      "Hard",
      "Very hard",
      "Max effort",
    ],
    exhaustion: [
      "Not tired",
      "Barely tired",
      "A little tired",
      "Tired",
      "Very tired",
      "Really tired",
      "Drained",
    ],
  },
  log: {
    overMax: (max: number, unit: string) => `Max is ${max} ${unit}`,
    underMin: (min: number, unit: string) => `Min is ${min} ${unit}`,
  },
  allEffortCounts: "Every player’s effort counts.",
  recoveryNote:
    "Feeling worn out? Hydrate, take it easy, and check with a parent or coach.",
  noEditing:
    "Saved entries cannot be edited. Recent entries can be deleted and re-entered.",
  auth: {
    opening: "Opening ZoomiGo…",
    unavailableTitle: "ZoomiGo is taking a breather",
    unavailableBody: "Please try again in a moment.",
    loginTitle: "Player sign in",
    loginIntro: "Scan your personal QR code, then enter your four-digit PIN.",
    pinLabel: "Four-digit PIN",
    remember: "Remember this device for 30 days",
    invalidPIN: "Enter the four-digit PIN from your parent or coach.",
    help: "Need help? Ask a parent or coach to reissue your QR code.",
    // Landing here without a scan is not an error the child can type their way
    // out of: the credential is the QR code, so the page offers no input at all.
    scanTitle: "Scan your QR code to sign in",
    scanBody:
      "Your printed QR code is what signs you in. Point a phone camera at your own code and it will bring you back here.",
    // Every sign-in failure says this, whatever actually went wrong, so that
    // guessing at codes tells an attacker nothing.
    signInFailed:
      "That did not work. Ask a parent or coach to reissue your QR code.",
    staffLink: "Coaches and staff sign in",
  },
  staff: {
    signInTitle: "Coach and staff sign in",
    signInIntro:
      "This page is for coaches and staff. Players sign in by scanning their QR code.",
    playerLink: "Player sign in",
    comingSoon: "Staff sign in opens with the console.",
  },
  social: {
    teamLoading: "Loading team progress…",
    teamError: "Team progress could not be loaded.",
    leaderboardLoading: "Loading leaderboard…",
    leaderboardError: "The leaderboard could not be loaded.",
    retry: "Try again",
    weeklyGoal: "This week’s goal",
    dueSunday: "◇ By Sunday",
    consistencyBadge: "✦ 3 active days in 5 = Consistency badge",
    teamChallenge: "Team challenge",
    challengeCount: (completed: number, total: number) =>
      `${completed} of ${total} teammates completed`,
    challengeTarget: (value: number, unit: string) => `${value} ${unit}`,
    challengeDue: (date: string) => `Due ${date}`,
    noChallenge: "The next Team challenge is warming up.",
    cheer: "Cheer",
    you: "You",
    safePoints: "safe participation points",
    noParticipation: "No participation has been recorded for this period yet.",
  },
  cheers: {
    pickerEyebrow: "Choose a cheer",
    pickerTitle: (name: string) => `Cheer for ${name}`,
    pickerContext: (context: string) => `For ${context}`,
    sent: (emoji: string, name: string) => `${emoji} sent to ${name}!`,
    close: "Close reaction picker",
    failed: "That cheer could not be sent.",
    limitReached:
      "You have sent five cheers to this teammate in the last 30 minutes. Try again soon.",
    contextLabels: {
      challenge: "Challenge",
      team_progress: "Team progress",
      leaderboard: "Leaderboard",
    },
    options: [
      { type: "clap", emoji: "👏", label: "Clap" },
      { type: "fire", emoji: "🔥", label: "Fire" },
      { type: "strong", emoji: "💪", label: "Strong" },
      { type: "hustle", emoji: "⚡", label: "Hustle" },
      { type: "runner", emoji: "🏃", label: "Runner" },
      { type: "wind", emoji: "💨", label: "Wind" },
      { type: "robot-leg", emoji: "🦿", label: "Robot leg" },
      { type: "do-it", emoji: "✓", label: "Do it" },
    ],
  },
} as const;
