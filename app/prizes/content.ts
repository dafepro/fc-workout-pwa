export const prizeBoxCopy = {
  eyebrow: "Rewards",
  title: "Prize boxes",
  subtitle: "Earn from workouts. Open to reveal items for you and the team.",
  back: "Back to Today",
  help: "How Prize Boxes work",
  status: {
    claimNow: "Claim now",
    ready: "Ready to open",
    earned: "Earned total",
  },
  daily: {
    eyebrow: "Daily freebie",
    available: "Ready to claim!",
    body: "Come back each day for one free box.",
    claim: "Claim daily box",
    claiming: "Claiming…",
    claimed: "Daily box claimed",
    claimedBody: "Added to your boxes.",
    complete: "Collection complete",
    completeBody: "You already found every item in this collection.",
  },
  boxes: {
    title: "Your boxes",
    empty: "No unopened boxes right now.",
    hint: "Open a box to reveal your prize.",
    opening: "Opening…",
  },
  recent: {
    title: "Recently earned",
    empty: "Opened prizes will appear here.",
    all: "View all prizes",
  },
  reveal: {
    title: "Zoomi found something!",
    workout: "Earned from your coach plan.",
    daily: "Zoomi brought this back from today's free box.",
    avatar: "Avatar",
    team: "Team Lounge",
    useAvatar: "Use on avatar",
    useTeam: "Use in Team Lounge",
    collection: "Keep in collection",
    complete: "You found every item in this collection.",
  },
  errors: {
    load: "Prize boxes could not be loaded.",
    claim: "Today's box is still available. Try claiming it again.",
    open: "That box is still sealed. Try opening it again.",
    retry: "Try again",
  },
  source: {
    daily: "Daily freebie",
    workout: "From workouts",
    fullPlan: "Full plan",
  },
  helpItems: [
    "One free box is available each day.",
    "Coach-plan participation can earn extra boxes.",
    "Claiming adds a sealed box to Your boxes.",
    "Open boxes whenever you want.",
    "Opened items join your collection.",
    "Compatible items can be used in Team Lounge or Avatar Studio.",
  ],
} as const;

export function rarityLabel(rarity: string) {
  return rarity.charAt(0).toUpperCase() + rarity.slice(1);
}
