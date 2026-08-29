export const loungeQuickPhrases = [
  { id: "hi", text: "Hi!" },
  { id: "bye", text: "Bye!" },
  { id: "lets-go", text: "Let's Go!" },
  { id: "nice", text: "Nice!" },
  { id: "ok", text: "OK" },
  { id: "oops", text: "Oops" },
  { id: "no", text: "No" },
  { id: "yep", text: "Yep" },
  { id: "huh", text: "Huh?" },
  { id: "thanks-bromigo", text: "Thanks Bromigo" },
] as const;

export type LoungeQuickPhrase = (typeof loungeQuickPhrases)[number];
