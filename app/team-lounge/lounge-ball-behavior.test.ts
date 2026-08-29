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
  it("ignores a walking-speed brush against the ball", () => {
    const subject = harness();
    subject.host.body(subject.entityId).transform = {
      x: 50,
      y: 80,
      rotation: 0,
    };
    subject.host.body("avatar-1", { x: 46, y: 80 }).velocity = { x: 1, y: 0 };

    subject
      .send({
        type: "contact.enter",
        selfColliderId: "kick",
        other: avatarParty("avatar-1"),
      })
      .flush();

    expect(subject.commands("applyImpulse")).toHaveLength(0);
  });

  it("turns a jogging contact into a gentle nudge", () => {
    const subject = harness();
    subject.host.body(subject.entityId).transform = {
      x: 50,
      y: 80,
      rotation: 0,
    };
    subject.host.body("avatar-1", { x: 46, y: 80 }).velocity = { x: 4, y: 0 };

    subject
      .send({
        type: "contact.enter",
        selfColliderId: "kick",
        other: avatarParty("avatar-1"),
      })
      .flush();

    const impulse = subject.commands("applyImpulse")[0]?.impulse.x ?? 0;
    expect(impulse).toBeGreaterThan(0);
    expect(impulse).toBeLessThan(8);
  });

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

  it("caps kick power even when the avatar is moving above full speed", () => {
    const kickAt = (speed: number) => {
      const subject = harness();
      subject.host.body(subject.entityId).transform = {
        x: 50,
        y: 80,
        rotation: 0,
      };
      subject.host.body("avatar-1", { x: 46, y: 80 }).velocity = {
        x: speed,
        y: 0,
      };
      subject
        .send({
          type: "contact.enter",
          selfColliderId: "kick",
          other: avatarParty("avatar-1"),
        })
        .flush();
      return subject.commands("applyImpulse")[0]?.impulse.x;
    };

    expect(kickAt(20)).toBe(defaultLoungeBallConfig.maxImpulse);
    expect(kickAt(40)).toBe(defaultLoungeBallConfig.maxImpulse);
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
