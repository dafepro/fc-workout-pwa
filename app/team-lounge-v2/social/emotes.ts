export const LOUNGE_EMOTE_COOLDOWN_MS = 2_000;
export const LOUNGE_EMOTE_DURATION_MS = 2_400;

export const loungeEmotes = [
  { kind: "zoomigo.emote.wave", symbol: "👋", label: "Wave" },
  { kind: "zoomigo.emote.heart", symbol: "❤️", label: "Heart" },
  { kind: "zoomigo.emote.ball", symbol: "⚽", label: "Soccer ball" },
  { kind: "zoomigo.emote.star", symbol: "⭐", label: "Star" },
  { kind: "zoomigo.emote.laugh", symbol: "😂", label: "Laugh" },
] as const;

export type LoungeEmote = (typeof loungeEmotes)[number];
export type LoungeEmoteKind = LoungeEmote["kind"];

const emotesBySignal = new Map<string, LoungeEmote>(
  loungeEmotes.map((emote) => [emote.kind, emote]),
);

export function loungeEmoteForSignal(signal: string): LoungeEmote | undefined {
  return emotesBySignal.get(signal);
}
