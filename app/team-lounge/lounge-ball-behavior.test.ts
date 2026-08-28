import { describe, expect, it } from "vitest";
import { BehaviorTestHarness, avatarParty } from "@canvas-physics/core/testing";

import {
  LoungeBallBehavior,
  defaultLoungeBallConfig,
  type LoungeBallConfig,
  type LoungeBallState,
} from "./lounge-ball-behavior";

const harness = () =>
  new BehaviorTestHarness<LoungeBallConfig, LoungeBallState>(
    LoungeBallBehavior,
    defaultLoungeBallConfig,
    { canvas: { orientation: "topDown", width: 100, height: 150 } },
  );

describe("LoungeBallBehavior", () => {
  it("turns a direct player contact into a strong kick", () => {
    const subject = harness();
    subject.host.body(subject.entityId).transform = {
      x: 50,
      y: 80,
      rotation: 0,
    };
    subject.host.body("avatar-1", { x: 46, y: 80 }).velocity = { x: 8, y: 0 };

    subject
      .send({
        type: "contact.enter",
        selfColliderId: "kick",
        other: avatarParty("avatar-1"),
      })
      .flush();

    expect(subject.host.body(subject.entityId).velocity.x).toBeGreaterThan(24);
    expect(subject.commands("applyImpulse")).toHaveLength(1);
  });

  it("turns a glancing kick into lateral movement and visible rotation", () => {
    const subject = harness();
    subject.host.body(subject.entityId).transform = {
      x: 50,
      y: 80,
      rotation: 0,
    };
    subject.host.body("avatar-1", { x: 50, y: 76 }).velocity = { x: 7, y: 8 };

    subject
      .send({
        type: "contact.enter",
        selfColliderId: "kick",
        other: avatarParty("avatar-1"),
      })
      .flush();

    expect(subject.commands("applyImpulse")[0]?.impulse.x).toBeGreaterThan(0);
    expect(
      Math.abs(subject.host.body(subject.entityId).angularVelocity),
    ).toBeGreaterThan(0);
  });
});
