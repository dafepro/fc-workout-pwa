import {
  clamp,
  dot,
  normalize,
  sub,
  type BehaviorContext,
  type BehaviorEvent,
  type BehaviorResult,
  type ItemBehavior,
} from "@canvas-physics/core";

export interface LoungeBallConfig {
  sensorId: string;
  minKickSpeed: number;
  kickExponent: number;
  kickStrength: number;
  pinchStrength: number;
  maxImpulse: number;
  tangentialStrength: number;
  maxTangentialImpulse: number;
  spinTransfer: number;
  spinRadius: number;
  maxAngularSpeed: number;
  cooldownSeconds: number;
}

export interface LoungeBallState {
  kickCount: number;
  cooldownUntil: [entityId: string, tick: number][];
}

export const defaultLoungeBallConfig: LoungeBallConfig = {
  sensorId: "kick",
  minKickSpeed: 2.5,
  kickExponent: 1.35,
  kickStrength: 3,
  pinchStrength: 2.8,
  maxImpulse: 48,
  tangentialStrength: 0.48,
  maxTangentialImpulse: 8,
  spinTransfer: 1,
  spinRadius: 4.5,
  maxAngularSpeed: 15,
  cooldownSeconds: 0.16,
};

const cooldownFor = (state: Readonly<LoungeBallState>, entityId: string) =>
  state.cooldownUntil.find(([id]) => id === entityId)?.[1] ?? 0;

export const LoungeBallBehavior: ItemBehavior<
  LoungeBallConfig,
  LoungeBallState
> = {
  behaviorType: "zoomigoLoungeBall",
  stateVersion: 1,
  subscribes: ["contact.enter", "contact.stay", "room.wake"],
  initialState: () => ({ kickCount: 0, cooldownUntil: [] }),
  onEvent(
    ctx: BehaviorContext,
    config: LoungeBallConfig,
    state: Readonly<LoungeBallState>,
    event: BehaviorEvent,
  ): BehaviorResult<LoungeBallState> {
    if (event.type === "room.wake") {
      return { state: { ...state, cooldownUntil: [] }, commands: [] };
    }
    if (
      (event.type !== "contact.enter" && event.type !== "contact.stay") ||
      event.selfColliderId !== config.sensorId ||
      event.other.kind !== "avatar" ||
      ctx.tick < cooldownFor(state, event.other.entityId)
    ) {
      return { state: state as LoungeBallState, commands: [] };
    }

    const ball = ctx.transform();
    const avatar = ctx.transform(event.other.entityId);
    if (!ball || !avatar)
      return { state: state as LoungeBallState, commands: [] };

    const normal = normalize(sub(ball, avatar));
    const avatarVelocity = ctx.velocity(event.other.entityId) ?? { x: 0, y: 0 };
    const ballVelocity = ctx.velocity() ?? { x: 0, y: 0 };
    const relativeVelocity = sub(avatarVelocity, ballVelocity);
    const closingSpeed = Math.max(0, dot(avatarVelocity, normal));
    const kickSpeed = Math.max(0, closingSpeed - config.minKickSpeed);
    const magnitude = clamp(
      config.kickStrength * Math.pow(kickSpeed, config.kickExponent) +
        config.pinchStrength * Math.max(0, -dot(ballVelocity, normal)),
      0,
      config.maxImpulse,
    );
    if (magnitude === 0)
      return { state: state as LoungeBallState, commands: [] };

    const tangent = { x: -normal.y, y: normal.x };
    const tangentialSpeed = dot(relativeVelocity, tangent);
    const tangentialImpulse = clamp(
      config.tangentialStrength * tangentialSpeed,
      -config.maxTangentialImpulse,
      config.maxTangentialImpulse,
    );
    const angularVelocity = clamp(
      (ctx.angularVelocity() ?? 0) -
        (tangentialSpeed / config.spinRadius) * config.spinTransfer,
      -config.maxAngularSpeed,
      config.maxAngularSpeed,
    );

    const cooldownUntil: [string, number][] = [
      ...state.cooldownUntil.filter(([id]) => id !== event.other.entityId),
      [event.other.entityId, ctx.tick + ctx.ticksFor(config.cooldownSeconds)],
    ];
    cooldownUntil.sort(([left], [right]) => left.localeCompare(right));

    return {
      state: {
        kickCount: state.kickCount + 1,
        cooldownUntil,
      },
      commands: [
        {
          type: "applyImpulse",
          impulse: {
            x: normal.x * magnitude + tangent.x * tangentialImpulse,
            y: normal.y * magnitude + tangent.y * tangentialImpulse,
          },
        },
        ...(Math.abs(tangentialSpeed) > 0.001
          ? [{ type: "setVelocity" as const, angularVelocity }]
          : []),
        { type: "emitEffect", effect: "kickPuff", params: { magnitude } },
      ],
    };
  },
};
