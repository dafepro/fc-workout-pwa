export const LOUNGE_EMOTE_COOLDOWN_MS = 2_000;
export const LOUNGE_EMOTE_DURATION_MS = 2_400;

export const loungeEmotes = [
  { symbol: "👋", label: "Wave" },
  { symbol: "❤️", label: "Heart" },
  { symbol: "⚽", label: "Soccer ball" },
  { symbol: "⭐", label: "Star" },
  { symbol: "😂", label: "Laugh" },
] as const;

export type LoungeEmote = (typeof loungeEmotes)[number];
