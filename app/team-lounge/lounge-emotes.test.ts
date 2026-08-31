import { describe, expect, it } from "vitest";

import { LOUNGE_REACTION_DURATION_MS, loungeEmotes } from "./lounge-emotes";

describe("Lounge emotes", () => {
  it("keeps the predefined, short-lived V2 action set", () => {
    expect(loungeEmotes.map(({ label }) => label)).toEqual([
      "Wave",
      "Heart",
      "Soccer ball",
      "Star",
      "Laugh",
    ]);
    expect(LOUNGE_REACTION_DURATION_MS).toBe(2_400);
  });
});
