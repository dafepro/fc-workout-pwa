export const loungeQuickPhrases = [
  { id: "nice", text: "Nice!" },
  { id: "lets-go", text: "Let’s go!" },
  { id: "great-work", text: "Great work!" },
  { id: "you-got-this", text: "You’ve got this!" },
  { id: "team-time", text: "Team time!" },
] as const;

export type LoungeQuickPhrase = (typeof loungeQuickPhrases)[number];
