import { describe, expect, it } from "vitest";

import { loungeQuickPhrases } from "./lounge-quick-phrases";

describe("Lounge quick phrases", () => {
  it("offers the ten fixed Standard chat choices", () => {
    expect(loungeQuickPhrases).toEqual([
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
    ]);
  });
});
