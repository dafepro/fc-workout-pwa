import { describe, expect, it } from "vitest";
import {
  LOUNGE_EMOTE_COOLDOWN_MS,
  LOUNGE_EMOTE_DURATION_MS,
  loungeEmoteForSignal,
  loungeEmotes,
} from "./emotes";

describe("Team Lounge V2 emotes", () => {
  it("exposes exactly five predefined payload-free signals", () => {
    expect(loungeEmotes).toEqual([
      { kind: "zoomigo.emote.wave", symbol: "👋", label: "Wave" },
      { kind: "zoomigo.emote.heart", symbol: "❤️", label: "Heart" },
      { kind: "zoomigo.emote.ball", symbol: "⚽", label: "Soccer ball" },
      { kind: "zoomigo.emote.star", symbol: "⭐", label: "Star" },
      { kind: "zoomigo.emote.laugh", symbol: "😂", label: "Laugh" },
    ]);
    expect(new Set(loungeEmotes.map(({ kind }) => kind)).size).toBe(5);
    expect(LOUNGE_EMOTE_COOLDOWN_MS).toBe(2_000);
    expect(LOUNGE_EMOTE_DURATION_MS).toBe(2_400);
  });

  it("ignores signals outside the product allowlist", () => {
    expect(loungeEmoteForSignal("zoomigo.emote.wave")?.symbol).toBe("👋");
    expect(loungeEmoteForSignal("free.text.message")).toBeUndefined();
  });
});
