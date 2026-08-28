import { describe, expect, it } from "vitest";

import {
  LOUNGE_EMOTE_COOLDOWN_MS,
  LOUNGE_EMOTE_DURATION_MS,
  loungeEmotes,
} from "./lounge-emotes";

describe("Lounge emotes", () => {
  it("keeps the predefined, short-lived V2 action set", () => {
    expect(loungeEmotes.map(({ label }) => label)).toEqual([
      "Wave",
      "Heart",
      "Soccer ball",
      "Star",
      "Laugh",
    ]);
    expect(LOUNGE_EMOTE_COOLDOWN_MS).toBe(2_000);
    expect(LOUNGE_EMOTE_DURATION_MS).toBe(2_400);
  });
});
