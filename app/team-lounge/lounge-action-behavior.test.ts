import { describe, expect, it } from "vitest";
import { BehaviorTestHarness } from "@canvas-physics/core/testing";

import { LoungeActionBehavior } from "./lounge-action-behavior";

describe("LoungeActionBehavior", () => {
  it("turns an authenticated owner action into a sender-bound emote effect", () => {
    const subject = new BehaviorTestHarness(LoungeActionBehavior, {});

    subject
      .send({
        type: "owner.action",
        action: "zoomigo.emote",
        userId: "player-one",
        payload: { emote: "wave" },
      })
      .flush();

    expect(subject.effects("zoomigo.emote")).toMatchObject([
      { params: { playerId: "player-one", emote: "wave" } },
    ]);
  });
});
