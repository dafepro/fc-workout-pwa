import { describe, expect, it } from "vitest";

import {
  cancelPrototypeReward,
  createPrototypeReward,
  publishPrototypeReward,
} from "./team-reward-prototype";

describe("team reward prototype lifecycle", () => {
  it("publishes a draft and refuses a second active reward for the team", () => {
    const first = publishPrototypeReward(createPrototypeReward("team-1"), []);

    expect(first.status).toBe("active");
    expect(() =>
      publishPrototypeReward(createPrototypeReward("team-1"), [first]),
    ).toThrow("one active reward");
  });

  it("allows a new reward after the active reward is cancelled", () => {
    const first = publishPrototypeReward(createPrototypeReward("team-1"), []);
    const cancelled = cancelPrototypeReward(first);
    const next = publishPrototypeReward(createPrototypeReward("team-1"), [
      cancelled,
    ]);

    expect(cancelled.status).toBe("cancelled");
    expect(next.status).toBe("active");
  });

  it("keeps rewards for other teams independent", () => {
    const first = publishPrototypeReward(createPrototypeReward("team-1"), []);

    expect(
      publishPrototypeReward(createPrototypeReward("team-2"), [first]).status,
    ).toBe("active");
  });
});
