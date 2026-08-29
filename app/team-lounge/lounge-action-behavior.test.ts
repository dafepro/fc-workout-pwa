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

  it("turns an allowlisted quick-message action into a sender-bound effect", () => {
    const subject = new BehaviorTestHarness(LoungeActionBehavior, {});

    subject
      .send({
        type: "owner.action",
        action: "zoomigo.quickPhrase",
        userId: "player-two",
        payload: { phrase: "nice" },
      })
      .flush();

    expect(subject.effects("zoomigo.quickPhrase")).toMatchObject([
      { params: { playerId: "player-two", phrase: "nice" } },
    ]);
  });

  it("ignores a quick message payload that contains open text", () => {
    const subject = new BehaviorTestHarness(LoungeActionBehavior, {});

    subject
      .send({
        type: "owner.action",
        action: "zoomigo.quickPhrase",
        userId: "player-two",
        payload: { phrase: "nice", text: "custom" },
      })
      .flush();

    expect(subject.effects("zoomigo.quickPhrase")).toEqual([]);
  });
});
