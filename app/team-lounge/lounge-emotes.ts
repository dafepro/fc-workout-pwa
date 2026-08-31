export const LOUNGE_REACTION_DURATION_MS = 2_400;

export const loungeEmotes = [
  { id: "wave", symbol: "👋", label: "Wave" },
  { id: "heart", symbol: "❤️", label: "Heart" },
  { id: "soccer", symbol: "⚽", label: "Soccer ball" },
  { id: "star", symbol: "⭐", label: "Star" },
  { id: "laugh", symbol: "😂", label: "Laugh" },
] as const;

export type LoungeEmote = (typeof loungeEmotes)[number];
