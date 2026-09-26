export const qualityCopy = {
  offline:
    "You’re offline. Your unfinished edits stay on this device. Reconnect before saving or joining your team.",
  updateDraft:
    "An update is ready. Save or discard your unfinished edits first.",
  updateReady: "An app update is ready.",
  update: "Update app",
  install: "Add ZoomiGo to your home screen",
  installSteps:
    "On iPhone or iPad, open this site in Safari, tap Share, then Add to Home Screen. On Android, open the browser menu and choose Install app or Add to Home Screen. On desktop, use the install icon in the address bar when available.",
  connectionNeeded:
    "You’ll still need a connection to save training and play with your team.",
  account: "Account and app",
  accountHelp:
    "Your QR code and PIN sign you in. Ask your coach if you need help with your login.",
  howTo: (name: string) => `How to do ${name}`,
  actualAmount:
    "Enter what you actually completed. Check the amount and how you felt before saving.",
  target: (value: number | undefined, unit: string) =>
    `Your target is ${value} ${unit}. `,
  rewardHistory: "Reward history",
  pastRewards: "Past rewards",
  rewardStates: {
    ended: "Ended",
    achieved: "Earned",
    upcoming: "Upcoming",
    current: "In progress",
  },
  rewardRule: (percent: number) =>
    `A team day counts when at least ${percent}% of eligible teammates complete planned activity or check in for planned rest.`,
  ended: (date: string) => `Ended ${date}`,
  starts: (date: string) => `Starts ${date}`,
  weekly: (current: number, goal: number) =>
    `${current} of ${goal} check-ins this week`,
  weeklyRule:
    "A completed workout or planned rest check-in counts. More activity in one day does not add another check-in.",
  howMomentum: "How Momentum works",
  momentumRule:
    "Momentum is a score from 0 to 100 based on your recent consistency. Your streak counts consecutive check-in days. The five-day view is a rolling window, so it can differ from this week.",
  momentumTip:
    "Regular check-ins build Momentum. Older activity gradually contributes less.",
  prizePreview: (label: string) =>
    `${label} is in your wardrobe. Preview it, then Save to keep the change.`,
  preview: (label: string) => `Preview ${label}`,
  portraitUnavailable:
    "This item is not in your available portrait wardrobe. Your saved look has not changed.",
  loungeUnavailable:
    "This item is not available in your Lounge inventory. Choose an item from your collection.",
  chatPreview: (label: string) =>
    `${label} is ready to preview in Chat settings.`,
  chatChoose: "From your Prizes · choose this pack to use it",
  backPrizes: "Back to Prizes",
  backMe: "Back to Me",
  loungeGate: "Check in to use your Lounge items",
  keptItems: "Your items will be here when you return.",
  worldIdentity: "Your identity in Team World",
  worldRepresentation:
    "This is your saved portrait. Your 3D field character wears a separate assigned outfit. Portrait items apply to your profile and Team Lounge.",
  editPortrait: "Edit your portrait",
} as const;
