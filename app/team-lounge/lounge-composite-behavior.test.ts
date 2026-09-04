import { describe, expect, it } from "vitest";
import { BehaviorTestHarness, avatarParty } from "@canvas-physics/core/testing";

import {
  LoungeCompositeBehavior,
  type LoungeCompositeConfig,
  type LoungeCompositeState,
} from "./lounge-composite-behavior";

const harness = (config: LoungeCompositeConfig) =>
  new BehaviorTestHarness<LoungeCompositeConfig, LoungeCompositeState>(
    LoungeCompositeBehavior,
    config,
    {
      canvas: { orientation: "topDown", width: 100, height: 150 },
      tickRate: 60,
    },
  );

describe("LoungeCompositeBehavior effects", () => {
  it("rotates a boost into item space, caps its speed, and adds a hop", () => {
    const subject = harness({
      effects: [
        {
          kind: "boost",
          sensorId: "zone",
          speed: 18,
          directionRadians: Math.PI / 2,
        },
        { kind: "hop", sensorId: "zone", elevationSpeed: 7 },
      ],
    });
    subject.host.body(subject.entityId).transform = {
      x: 50,
      y: 50,
      rotation: Math.PI / 2,
    };
    subject.host.body("avatar-1").velocity = { x: 30, y: -4 };

    subject
      .send({
        type: "contact.enter",
        selfColliderId: "zone",
        other: avatarParty("avatar-1"),
      })
      .flush();

    expect(subject.host.body("avatar-1").velocity.x).toBeCloseTo(-18, 8);
    expect(subject.host.body("avatar-1").velocity.y).toBeCloseTo(0, 8);
    expect(subject.host.body("avatar-1").elevation?.vz).toBe(7);
    expect(subject.effects("lounge.boost")).toHaveLength(1);
  });

  it("accelerates only tagged balls along a rotated speed lane without replacing momentum", () => {
    const subject = harness({
      effects: [
        {
          kind: "accelerate",
          sensorId: "lane",
          impulsePerSecond: 30,
          acceptedDefinitionIds: ["beach-ball", "zoomigo-prop-beach-ball"],
        },
      ],
    });
    subject.host.body(subject.entityId).transform = {
      x: 50,
      y: 50,
      rotation: Math.PI / 2,
    };
    subject.host.body("ball").velocity = { x: 31, y: 27 };

    subject
      .send({
        type: "contact.stay",
        selfColliderId: "lane",
        other: {
          entityId: "ball",
          colliderId: "solid",
          kind: "item",
          tags: ["beach-ball"],
        },
        dwellTicks: 2,
      })
      .flush();

    expect(subject.commands("setVelocity")).toHaveLength(0);
    const acceleration = subject.commands("applyImpulse")[0];
    expect(acceleration?.target).toBe("ball");
    expect(acceleration?.impulse.x).toBeCloseTo(0, 8);
    expect(acceleration?.impulse.y).toBeCloseTo(0.5, 8);
    expect(subject.host.body("ball").velocity.x).toBeCloseTo(31, 8);
    expect(subject.host.body("ball").velocity.y).toBeGreaterThan(27);

    subject
      .send({
        type: "contact.stay",
        selfColliderId: "lane",
        other: avatarParty("avatar-1"),
        dwellTicks: 2,
      })
      .flush();
    expect(subject.commands("applyImpulse")).toHaveLength(1);
  });

  it("bounces directly away from the item and applies a signed wobble torque", () => {
    const subject = harness({
      effects: [
        { kind: "bounce", sensorId: "bumper", impulse: 12 },
        { kind: "wobble", sensorId: "bumper", torque: 5 },
      ],
    });
    subject.host.body(subject.entityId).transform = {
      x: 50,
      y: 60,
      rotation: 0,
    };
    subject.host.body("avatar-1").transform = {
      x: 53,
      y: 64,
      rotation: 0,
    };

    subject
      .send({
        type: "contact.enter",
        selfColliderId: "bumper",
        other: avatarParty("avatar-1"),
      })
      .flush();

    const bounce = subject.commands("applyImpulse")[0];
    expect(bounce?.target).toBe("avatar-1");
    expect(bounce?.impulse.x).toBeCloseTo(7.2, 8);
    expect(bounce?.impulse.y).toBeCloseTo(9.6, 8);
    expect(subject.commands("applyTorque")[0]).toMatchObject({ torque: 5 });
  });

  it("wobbles and nudges the cone itself when a non-blocked avatar crosses its sensor", () => {
    const subject = harness({
      effects: [
        {
          kind: "bounce",
          sensorId: "bumper",
          impulse: 7,
          acceptedDefinitionIds: ["beach-ball"],
        },
        {
          kind: "wobble",
          sensorId: "bumper",
          torque: 780,
          nudgeImpulse: 0.9,
        },
      ],
    });
    subject.host.body(subject.entityId).transform = {
      x: 50,
      y: 60,
      rotation: 0,
    };
    subject.host.body("avatar-1").transform = {
      x: 47,
      y: 60,
      rotation: 0,
    };

    subject
      .send({
        type: "contact.enter",
        selfColliderId: "bumper",
        other: avatarParty("avatar-1"),
      })
      .flush();

    expect(subject.commands("applyImpulse")).toMatchObject([
      { impulse: { x: 0.9, y: 0 } },
    ]);
    expect(subject.commands("applyTorque")).toMatchObject([{ torque: -780 }]);
    expect(subject.state.wobbleSequence).toBe(1);
  });

  it("launches a directional bumper along its rotated forward axis", () => {
    const subject = harness({
      effects: [
        {
          kind: "bounce",
          sensorId: "bumper",
          impulse: 56,
          directionRadians: -Math.PI / 2,
        },
      ],
    });
    subject.host.body(subject.entityId).transform = {
      x: 50,
      y: 60,
      rotation: Math.PI / 2,
    };
    subject.host.body("ball").transform = { x: 44, y: 65, rotation: 0 };

    subject
      .send({
        type: "contact.enter",
        selfColliderId: "bumper",
        other: {
          entityId: "ball",
          colliderId: "solid",
          kind: "item",
          tags: ["beach-ball"],
        },
      })
      .flush();

    expect(subject.commands("applyImpulse")[0]?.impulse.x).toBeCloseTo(56, 8);
    expect(subject.commands("applyImpulse")[0]?.impulse.y).toBeCloseTo(0, 8);
    expect(subject.state.bumperSequence).toBe(1);
  });

  it("pushes along the prop's rotated forward axis on sustained contact", () => {
    const subject = harness({
      effects: [
        { kind: "push", sensorId: "air", force: 9 },
        { kind: "spin", angularVelocity: 2.5 },
      ],
    });
    subject.host.body(subject.entityId).transform = {
      x: 50,
      y: 60,
      rotation: Math.PI,
    };
    subject.host.body("avatar-1");

    subject
      .send({
        type: "contact.stay",
        selfColliderId: "air",
        other: avatarParty("avatar-1"),
        dwellTicks: 8,
      })
      .send({ type: "tick", dt: 1 / 60 })
      .flush();

    expect(subject.commands("applyForce")[0]?.force.x).toBeCloseTo(-9, 8);
    expect(subject.commands("applyForce")[0]?.force.y).toBeCloseTo(0, 8);
    expect(subject.host.body(subject.entityId).angularVelocity).toBe(2.5);
  });

  it("combines capped attraction and tangential force into a stable orbit", () => {
    const subject = harness({
      effects: [
        {
          kind: "orbit",
          sensorId: "field",
          radialForce: 8,
          tangentialForce: 6,
          maxForce: 10,
        },
      ],
    });
    subject.host.body(subject.entityId).transform = {
      x: 50,
      y: 50,
      rotation: 0,
    };
    subject.host.body("avatar-1").transform = {
      x: 60,
      y: 50,
      rotation: 0,
    };

    subject
      .send({
        type: "contact.stay",
        selfColliderId: "field",
        other: avatarParty("avatar-1"),
        dwellTicks: 3,
      })
      .flush();

    expect(subject.commands("applyForce")[0]).toMatchObject({
      target: "avatar-1",
      force: { x: -8, y: 6 },
    });
  });

  it("dampens linear and angular velocity by exact bounded factors", () => {
    const subject = harness({
      effects: [
        {
          kind: "dampen",
          sensorId: "surface",
          linearFactor: 0.8,
          angularFactor: 0.5,
          minimumSpeed: 1,
        },
      ],
    });
    const avatar = subject.host.body("avatar-1");
    avatar.velocity = { x: 10, y: -5 };
    avatar.angularVelocity = 4;

    subject
      .send({
        type: "contact.stay",
        selfColliderId: "surface",
        other: avatarParty("avatar-1"),
        dwellTicks: 2,
      })
      .flush();

    expect(avatar.velocity).toEqual({ x: 8, y: -4 });
    expect(avatar.angularVelocity).toBe(2);

    avatar.velocity = { x: 0.5, y: 0 };
    subject
      .send({
        type: "contact.stay",
        selfColliderId: "surface",
        other: avatarParty("avatar-1"),
        dwellTicks: 3,
      })
      .flush();
    expect(avatar.velocity).toEqual({ x: 0, y: 0 });
  });

  it("drives a deterministic swing whose quarter-period velocity is zero", () => {
    const subject = harness({
      effects: [
        {
          kind: "swing",
          amplitudeRadians: Math.PI / 4,
          periodSeconds: 2,
        },
      ],
    });

    subject.advance(1);
    expect(subject.host.body(subject.entityId).angularVelocity).toBeCloseTo(
      ((Math.PI * Math.PI) / 4) * Math.cos(Math.PI / 60),
      6,
    );
    subject.advance(29);
    expect(subject.host.body(subject.entityId).angularVelocity).toBeCloseTo(
      0,
      6,
    );
    expect(subject.state.elapsedTicks).toBe(30);
  });

  it("steers a duck flock away from nearby avatars and items with distance falloff", () => {
    const subject = harness({
      effects: [
        {
          kind: "flock",
          sensorId: "shore",
          radius: 10,
          lookAheadSeconds: 0.2,
          relaxSeconds: 0.8,
        },
      ],
    });
    subject.host.body(subject.entityId).transform = {
      x: 50,
      y: 50,
      rotation: 0,
    };
    subject.host.body("avatar-1").transform = {
      x: 54,
      y: 50,
      rotation: 0,
    };
    subject.host.body("avatar-1").velocity = { x: -2, y: 0 };

    subject
      .send({
        type: "contact.stay",
        selfColliderId: "shore",
        other: avatarParty("avatar-1"),
        dwellTicks: 1,
      })
      .flush();

    expect(subject.state.flockHeading).toBeCloseTo(Math.PI, 6);
    expect(subject.state.flockIntensity).toBeGreaterThan(0.25);
    const avatarAlarm = subject.state.flockAlarmUntil;

    subject.advance(1, false);
    subject.host.body("cone-1").transform = {
      x: 50,
      y: 56,
      rotation: 0,
    };
    subject
      .send({
        type: "contact.stay",
        selfColliderId: "shore",
        other: {
          entityId: "cone-1",
          colliderId: "solid",
          kind: "item",
          tags: ["zoomigo-prop-play-wobble-cone"],
        },
        dwellTicks: 1,
      })
      .flush();

    expect(subject.state.flockHeading).toBeLessThan(-Math.PI / 2);
    expect(subject.state.flockHeading).toBeGreaterThan(-Math.PI);
    expect(subject.state.flockAlarmUntil).toBeGreaterThan(avatarAlarm);
  });

  it("settles only an uncontrolled avatar into an occupied hammock", () => {
    const subject = harness({
      effects: [
        {
          kind: "rest",
          sensorId: "bed",
          engageMaxSpeed: 2,
          settleSpeed: 2.4,
          animationSeconds: 0.5,
        },
      ],
    });
    subject.host.body(subject.entityId).transform = {
      x: 50,
      y: 50,
      rotation: 0,
    };
    const avatar = subject.host.body("avatar-1");
    avatar.transform = { x: 56, y: 52, rotation: 0 };
    avatar.velocity = { x: 0.5, y: 0 };

    subject
      .send({
        type: "contact.stay",
        selfColliderId: "bed",
        other: avatarParty("avatar-1"),
        dwellTicks: 2,
      })
      .flush();

    expect(avatar.velocity.x).toBeLessThan(0);
    expect(avatar.velocity.y).toBeLessThan(0);
    expect(subject.state.hammockOccupied).toBe(true);
    expect(subject.state.hammockOccupantID).toBe("avatar-1");

    avatar.velocity = { x: 4, y: 0 };
    subject
      .send({
        type: "contact.stay",
        selfColliderId: "bed",
        other: avatarParty("avatar-1"),
        dwellTicks: 3,
      })
      .flush();
    expect(avatar.velocity).toEqual({ x: 4, y: 0 });
  });

  it("tracks a tagged ball along a bounded goalie rail and returns to its anchor", () => {
    const subject = harness({
      effects: [
        {
          kind: "goalie",
          sensorId: "save-zone",
          acceptedDefinitionIds: ["beach-ball"],
          travel: 8,
          maxSpeed: 18,
          trackingGain: 5,
          returnGain: 3,
        },
      ],
    });
    subject.host.body(subject.entityId).transform = {
      x: 40,
      y: 60,
      rotation: 0,
    };
    subject.send({ type: "tick", dt: 1 / 60 }).flush();
    subject.host.body("ball").transform = { x: 55, y: 60, rotation: 0 };

    subject
      .send({
        type: "contact.stay",
        selfColliderId: "save-zone",
        other: {
          entityId: "ball",
          colliderId: "solid",
          kind: "item",
          tags: ["beach-ball"],
        },
        dwellTicks: 1,
      })
      .flush();

    expect(subject.host.body(subject.entityId).velocity).toEqual({
      x: 18,
      y: 0,
    });
    expect(subject.state.motionAnchor).toEqual({ x: 40, y: 60 });
  });

  it("adopts an externally moved goalie position as its new home", () => {
    const subject = harness({
      effects: [
        {
          kind: "goalie",
          sensorId: "save-zone",
          acceptedDefinitionIds: ["beach-ball"],
          travel: 8,
          maxSpeed: 18,
          trackingGain: 5,
          returnGain: 3,
        },
      ],
    });
    subject.host.body(subject.entityId).transform = {
      x: 40,
      y: 60,
      rotation: 0,
    };
    subject.send({ type: "tick", dt: 1 / 60 }).flush();
    subject.host.body(subject.entityId).transform = {
      x: 70,
      y: 90,
      rotation: 0,
    };

    subject.send({ type: "tick", dt: 1 / 60 }).flush();

    expect(subject.state.motionAnchor).toEqual({ x: 70, y: 90 });
    expect(subject.host.body(subject.entityId).velocity).toEqual({
      x: 0,
      y: 0,
    });
  });

  it("holds a tagged ball, scores it, then launches it out along the goal axis", () => {
    const subject = harness({
      effects: [
        {
          kind: "dampen",
          sensorId: "mouth",
          linearFactor: 0.7,
          angularFactor: 0.7,
          minimumSpeed: 0.5,
        },
        {
          kind: "goal",
          sensorId: "mouth",
          acceptedDefinitionIds: ["beach-ball", "zoomigo-prop-beach-ball"],
          holdSeconds: 0.4,
          ejectOffset: { x: 0, y: 8 },
          ejectSpeed: 18,
          cooldownSeconds: 1,
        },
      ],
    });
    subject.host.body(subject.entityId).transform = {
      x: 50,
      y: 60,
      rotation: Math.PI / 2,
    };
    subject.host.body("ball").tags = ["beach-ball"];
    subject.host.body("ball").velocity = { x: 8, y: -4 };
    subject.host.body("ball").angularVelocity = 3;
    subject.host.body("not-ball").tags = ["training-cone"];
    const ball = {
      entityId: "ball",
      colliderId: "solid",
      kind: "item" as const,
      tags: ["beach-ball"],
    };

    subject
      .send({
        type: "contact.enter",
        selfColliderId: "mouth",
        other: {
          entityId: "not-ball",
          colliderId: "solid",
          kind: "item",
          tags: ["training-cone"],
        },
      })
      .send({
        type: "contact.stay",
        selfColliderId: "mouth",
        other: ball,
        dwellTicks: 23,
      })
      .flush();

    expect(subject.effects("lounge.goal")).toHaveLength(0);
    expect(subject.host.body("ball").velocity).toEqual({ x: 0, y: 0 });
    expect(subject.host.body("ball").angularVelocity).toBe(0);
    expect(subject.state.goalScore).toBe(0);
    subject
      .send({
        type: "contact.stay",
        selfColliderId: "mouth",
        other: ball,
        dwellTicks: 24,
      })
      .flush();

    expect(subject.effects("lounge.goal")).toMatchObject([
      { params: { target: "ball", score: 1 } },
    ]);
    expect(subject.host.body("ball").transform.x).toBeCloseTo(42, 8);
    expect(subject.host.body("ball").transform.y).toBeCloseTo(60, 8);
    expect(subject.host.body("ball").velocity.x).toBeCloseTo(-18, 8);
    expect(subject.host.body("ball").velocity.y).toBeCloseTo(0, 8);
    expect(subject.state.goalScore).toBe(1);

    subject.advanceSeconds(1.1, false);
    subject
      .send({
        type: "contact.stay",
        selfColliderId: "mouth",
        other: ball,
        dwellTicks: 90,
      })
      .flush();
    expect(subject.effects("lounge.goal")).toHaveLength(1);
    expect(subject.host.body("ball").velocity.x).toBeCloseTo(-18, 8);
    expect(subject.host.body("ball").velocity.y).toBeCloseTo(0, 8);

    subject
      .send({
        type: "contact.exit",
        selfColliderId: "mouth",
        other: ball,
        dwellTicks: 91,
      })
      .flush();
    subject.advanceSeconds(0.5, false);
    subject
      .send({
        type: "contact.enter",
        selfColliderId: "mouth",
        other: ball,
      })
      .flush();
    subject.advanceSeconds(0.6, false);
    subject
      .send({
        type: "contact.stay",
        selfColliderId: "mouth",
        other: ball,
        dwellTicks: 24,
      })
      .flush();
    expect(subject.effects("lounge.goal")).toHaveLength(1);
    expect(subject.state.goalScore).toBe(1);

    subject
      .send({
        type: "contact.exit",
        selfColliderId: "mouth",
        other: ball,
        dwellTicks: 24,
      })
      .flush();
    subject.advanceSeconds(1.1, false);
    subject
      .send({
        type: "contact.enter",
        selfColliderId: "mouth",
        other: ball,
      })
      .send({
        type: "contact.stay",
        selfColliderId: "mouth",
        other: ball,
        dwellTicks: 24,
      })
      .flush();
    expect(subject.effects("lounge.goal")).toHaveLength(2);
    expect(subject.state.goalScore).toBe(2);
  });

  it("wraps the two-digit score after the hundredth goal and emits confetti once", () => {
    const subject = harness({
      effects: [
        {
          kind: "goal",
          sensorId: "mouth",
          acceptedDefinitionIds: ["beach-ball", "zoomigo-prop-beach-ball"],
          holdSeconds: 0,
          ejectOffset: { x: 0, y: 8 },
          ejectSpeed: 18,
          cooldownSeconds: 0,
        },
      ],
    });
    subject.host.body(subject.entityId).transform = {
      x: 50,
      y: 60,
      rotation: 0,
    };
    const ball = {
      entityId: "ball",
      colliderId: "solid",
      kind: "item" as const,
      tags: ["zoomigo-prop-beach-ball"],
    };

    for (let score = 1; score <= 100; score += 1) {
      if (score > 1) {
        subject
          .send({
            type: "contact.exit",
            selfColliderId: "mouth",
            other: ball,
            dwellTicks: 1,
          })
          .flush();
        subject.advance(1, false);
      }
      subject
        .send({
          type: "contact.stay",
          selfColliderId: "mouth",
          other: ball,
          dwellTicks: 1,
        })
        .flush();
    }

    expect(subject.state.goalScore).toBe(0);
    expect(subject.effects("lounge.goal")).toHaveLength(100);
    expect(subject.effects("lounge.goal-confetti")).toMatchObject([
      { params: { score: 0 } },
    ]);
    expect(LoungeCompositeBehavior.stateVersion).toBe(6);
  });

  it("fuses, holds, and then launches only a predefined ball from the muzzle at high speed", () => {
    const subject = harness({
      effects: [
        {
          kind: "cannon",
          sensorId: "intake",
          acceptedDefinitionIds: ["beach-ball", "zoomigo-prop-beach-ball"],
          exitOffset: { x: 10, y: 0 },
          speed: 50,
          dwellSeconds: 0.8,
          cooldownSeconds: 0.75,
        },
      ],
    });
    subject.host.body(subject.entityId).transform = {
      x: 40,
      y: 60,
      rotation: Math.PI / 2,
    };
    subject.host.body("ball").tags = ["beach-ball"];
    subject.host.body("cone").tags = ["zoomigo-prop-play-wobble-cone"];

    subject
      .send({
        type: "contact.enter",
        selfColliderId: "intake",
        other: {
          entityId: "ball",
          colliderId: "solid",
          kind: "item",
          tags: ["beach-ball"],
        },
      })
      .send({
        type: "contact.stay",
        selfColliderId: "intake",
        other: {
          entityId: "cone",
          colliderId: "solid",
          kind: "item",
          tags: ["zoomigo-prop-play-wobble-cone"],
        },
        dwellTicks: 48,
      })
      .send({
        type: "contact.stay",
        selfColliderId: "intake",
        other: {
          entityId: "ball",
          colliderId: "solid",
          kind: "item",
          tags: ["beach-ball"],
        },
        dwellTicks: 47,
      })
      .flush();

    expect(subject.effects("lounge.cannon-fuse")).toMatchObject([
      { params: { target: "ball", durationSeconds: 0.8 } },
    ]);
    expect(subject.effects("lounge.cannon")).toHaveLength(0);
    expect(subject.host.body("cone").transform).toMatchObject({ x: 0, y: 0 });

    subject
      .send({
        type: "contact.stay",
        selfColliderId: "intake",
        other: {
          entityId: "ball",
          colliderId: "solid",
          kind: "item",
          tags: ["beach-ball"],
        },
        dwellTicks: 48,
      })
      .flush();

    expect(subject.host.body("ball").transform).toMatchObject({ x: 40, y: 70 });
    expect(subject.host.body("ball").velocity.x).toBeCloseTo(0, 8);
    expect(subject.host.body("ball").velocity.y).toBeCloseTo(50, 8);
    expect(subject.effects("lounge.cannon")).toMatchObject([
      { params: { target: "ball", speed: 50 } },
    ]);

    subject
      .send({
        type: "contact.stay",
        selfColliderId: "intake",
        other: {
          entityId: "ball",
          colliderId: "solid",
          kind: "item",
          tags: ["beach-ball"],
        },
        dwellTicks: 49,
      })
      .flush();
    expect(subject.effects("lounge.cannon")).toHaveLength(1);
  });

  it("clears transient target cooldowns on room wake without resetting motion phase", () => {
    const subject = harness({
      effects: [
        { kind: "boost", sensorId: "zone", speed: 10 },
        {
          kind: "swing",
          amplitudeRadians: 0.5,
          periodSeconds: 2,
        },
      ],
    });
    subject.advance(12);
    subject.send({ type: "room.wake", fromSnapshot: true }).flush();

    expect(subject.state.elapsedTicks).toBe(12);
    expect(subject.state.cooldownUntil).toEqual([]);
    expect(subject.host.body(subject.entityId).angularVelocity).toBeCloseTo(
      0.5 * Math.PI * Math.cos((Math.PI * 2 * 12) / 120),
      6,
    );
  });
});
