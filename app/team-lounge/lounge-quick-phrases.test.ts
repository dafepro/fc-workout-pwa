import { describe, expect, it } from "vitest";

import { loungeQuickPhrases } from "./lounge-quick-phrases";

describe("Lounge quick phrases", () => {
  it("offers a small, fixed, supportive catalog", () => {
    expect(loungeQuickPhrases).toEqual([
      { id: "nice", text: "Nice!" },
      { id: "lets-go", text: "Let’s go!" },
      { id: "great-work", text: "Great work!" },
      { id: "you-got-this", text: "You’ve got this!" },
      { id: "team-time", text: "Team time!" },
    ]);
  });
});
