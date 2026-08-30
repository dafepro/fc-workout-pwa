import {
  clamp,
  normalize,
  sub,
  type BehaviorCommand,
  type BehaviorContext,
  type BehaviorEvent,
  type ContactParty,
  type ItemBehavior,
  type Vec2,
} from "@canvas-physics/core";

type SensorEffect = { sensorId: string };

export type LoungeCompositeEffect =
  | ({ kind: "boost"; speed: number; directionRadians?: number } & SensorEffect)
  | ({ kind: "hop"; elevationSpeed: number } & SensorEffect)
  | ({ kind: "bounce"; impulse: number } & SensorEffect)
  | ({ kind: "wobble"; torque: number } & SensorEffect)
  | ({ kind: "push"; force: number; directionRadians?: number } & SensorEffect)
  | {
      kind: "spin";
      angularVelocity: number;
    }
  | ({
      kind: "orbit";
      radialForce: number;
      tangentialForce: number;
      maxForce: number;
    } & SensorEffect)
  | ({
      kind: "dampen";
      linearFactor: number;
      angularFactor: number;
      minimumSpeed: number;
    } & SensorEffect)
  | {
      kind: "swing";
      amplitudeRadians: number;
      periodSeconds: number;
    }
  | ({
      kind: "goal";
      acceptedDefinitionIds: string[];
      holdSeconds: number;
      ejectOffset: Vec2;
      ejectSpeed: number;
      cooldownSeconds: number;
    } & SensorEffect);

export interface LoungeCompositeConfig {
  effects: LoungeCompositeEffect[];
}

export interface LoungeCompositeState {
  elapsedTicks: number;
  cooldownUntil: [entityId: string, tick: number][];
  goalScore: number;
}

export const LoungeCompositeBehavior: ItemBehavior<
  LoungeCompositeConfig,
  LoungeCompositeState
> = {
  behaviorType: "zoomigoLoungeComposite",
  stateVersion: 2,
  subscribes: [
    "contact.enter",
    "contact.stay",
    "contact.exit",
    "tick",
    "room.wake",
  ],
  initialState: () => ({ elapsedTicks: 0, cooldownUntil: [], goalScore: 0 }),
  onEvent(ctx, config, state, event) {
    if (event.type === "room.wake") {
      return {
        state: { ...state, cooldownUntil: [] },
        commands: idleMotionCommands(ctx, config.effects, state.elapsedTicks),
      };
    }

    const nextState: LoungeCompositeState = {
      elapsedTicks: state.elapsedTicks,
      cooldownUntil: [...state.cooldownUntil],
      goalScore: state.goalScore,
    };
    const commands: BehaviorCommand[] = [];

    if (event.type === "contact.exit") {
      rearmExitedGoalTarget(ctx, config.effects, nextState, event);
    }
    if (event.type === "contact.enter") {
      blockEarlyGoalReentry(ctx, config.effects, nextState, event);
    }
    for (const effect of config.effects) {
      commands.push(...applyEffect(ctx, effect, nextState, event));
    }
    if (event.type === "tick") nextState.elapsedTicks += 1;

    return { state: nextState, commands };
  },
};

function applyEffect(
  ctx: BehaviorContext,
  effect: LoungeCompositeEffect,
  state: LoungeCompositeState,
  event: BehaviorEvent,
): BehaviorCommand[] {
  if (effect.kind === "spin") {
    return event.type === "tick"
      ? [
          {
            type: "setVelocity",
            angularVelocity: effect.angularVelocity,
          },
        ]
      : [];
  }
  if (effect.kind === "swing") {
    if (event.type !== "tick") return [];
    const periodTicks = Math.max(1, ctx.ticksFor(effect.periodSeconds));
    const elapsedTicks = state.elapsedTicks + 1;
    const angularFrequency = (Math.PI * 2) / effect.periodSeconds;
    return [
      {
        type: "setVelocity",
        angularVelocity:
          effect.amplitudeRadians *
          angularFrequency *
          Math.cos((Math.PI * 2 * elapsedTicks) / periodTicks),
      },
    ];
  }
  if (
    (event.type !== "contact.enter" && event.type !== "contact.stay") ||
    event.selfColliderId !== effect.sensorId ||
    (event.other.kind !== "avatar" && event.other.kind !== "item")
  ) {
    return [];
  }

  switch (effect.kind) {
    case "boost":
      return event.type === "contact.enter"
        ? boostCommands(
            ctx,
            event.other,
            effect.speed,
            effect.directionRadians ?? 0,
          )
        : [];
    case "hop":
      return event.type === "contact.enter"
        ? [
            {
              type: "setElevationVelocity",
              target: event.other.entityId,
              vz: effect.elevationSpeed,
            },
          ]
        : [];
    case "bounce":
      return event.type === "contact.enter"
        ? bounceCommands(ctx, event.other, effect.impulse)
        : [];
    case "wobble":
      return event.type === "contact.enter"
        ? wobbleCommands(ctx, event.other, effect.torque)
        : [];
    case "push":
      return event.type === "contact.stay"
        ? [
            {
              type: "applyForce",
              target: event.other.entityId,
              force: rotate(
                { x: effect.force, y: 0 },
                selfRotation(ctx) + (effect.directionRadians ?? 0),
              ),
            },
          ]
        : [];
    case "orbit":
      return event.type === "contact.stay"
        ? orbitCommands(ctx, event.other, effect)
        : [];
    case "dampen":
      return event.type === "contact.stay" &&
        cooldownFor(state, event.other.entityId) <= ctx.tick
        ? dampenCommands(ctx, event.other, effect)
        : [];
    case "goal":
      return event.type === "contact.stay"
        ? goalCommands(ctx, event.other, event.dwellTicks, effect, state)
        : [];
  }
}

function boostCommands(
  ctx: BehaviorContext,
  target: ContactParty,
  speed: number,
  directionRadians: number,
): BehaviorCommand[] {
  const direction = rotate(
    { x: speed, y: 0 },
    selfRotation(ctx) + directionRadians,
  );
  return [
    { type: "setVelocity", target: target.entityId, velocity: direction },
    {
      type: "emitEffect",
      effect: "lounge.boost",
      params: { target: target.entityId, speed },
    },
  ];
}

function bounceCommands(
  ctx: BehaviorContext,
  target: ContactParty,
  impulse: number,
): BehaviorCommand[] {
  const self = ctx.transform();
  const other = ctx.transform(target.entityId);
  if (!self || !other) return [];
  const direction = normalize(sub(other, self));
  return [
    {
      type: "applyImpulse",
      target: target.entityId,
      impulse: { x: direction.x * impulse, y: direction.y * impulse },
    },
    {
      type: "emitEffect",
      effect: "lounge.bounce",
      params: { target: target.entityId, impulse },
    },
  ];
}

function wobbleCommands(
  ctx: BehaviorContext,
  target: ContactParty,
  torque: number,
): BehaviorCommand[] {
  const self = ctx.transform();
  const other = ctx.transform(target.entityId);
  if (!self || !other) return [];
  const localContact = rotate(sub(other, self), -self.rotation);
  return [
    {
      type: "applyTorque",
      torque: localContact.x >= 0 ? torque : -torque,
    },
  ];
}

function orbitCommands(
  ctx: BehaviorContext,
  target: ContactParty,
  effect: Extract<LoungeCompositeEffect, { kind: "orbit" }>,
): BehaviorCommand[] {
  const self = ctx.transform();
  const other = ctx.transform(target.entityId);
  if (!self || !other) return [];
  const outward = normalize(sub(other, self));
  const force = {
    x: -outward.x * effect.radialForce - outward.y * effect.tangentialForce,
    y: -outward.y * effect.radialForce + outward.x * effect.tangentialForce,
  };
  const magnitude = Math.hypot(force.x, force.y);
  const factor = magnitude > effect.maxForce ? effect.maxForce / magnitude : 1;
  return [
    {
      type: "applyForce",
      target: target.entityId,
      force: { x: force.x * factor, y: force.y * factor },
    },
  ];
}

function dampenCommands(
  ctx: BehaviorContext,
  target: ContactParty,
  effect: Extract<LoungeCompositeEffect, { kind: "dampen" }>,
): BehaviorCommand[] {
  const velocity = ctx.velocity(target.entityId) ?? { x: 0, y: 0 };
  const speed = Math.hypot(velocity.x, velocity.y);
  const nextVelocity =
    speed < effect.minimumSpeed
      ? { x: 0, y: 0 }
      : {
          x: velocity.x * clamp(effect.linearFactor, 0, 1),
          y: velocity.y * clamp(effect.linearFactor, 0, 1),
        };
  return [
    {
      type: "setVelocity",
      target: target.entityId,
      velocity: nextVelocity,
      angularVelocity:
        (ctx.angularVelocity(target.entityId) ?? 0) *
        clamp(effect.angularFactor, 0, 1),
    },
  ];
}

function goalCommands(
  ctx: BehaviorContext,
  target: ContactParty,
  dwellTicks: number,
  effect: Extract<LoungeCompositeEffect, { kind: "goal" }>,
  state: LoungeCompositeState,
): BehaviorCommand[] {
  if (
    !goalAccepts(effect, target) ||
    cooldownFor(state, target.entityId) > ctx.tick
  ) {
    return [];
  }
  if (dwellTicks < ctx.ticksFor(effect.holdSeconds)) {
    return [
      {
        type: "setVelocity",
        target: target.entityId,
        velocity: { x: 0, y: 0 },
        angularVelocity: 0,
      },
    ];
  }
  const goalTransform = ctx.transform();
  if (!goalTransform) return [];
  setCooldown(state, target.entityId, BLOCKED_UNTIL_SENSOR_EXIT);
  state.goalScore = (state.goalScore + 1) % 100;
  const ejectOffset = rotate(effect.ejectOffset, goalTransform.rotation);
  const ejectVelocity = rotate(
    { x: 0, y: effect.ejectSpeed },
    goalTransform.rotation,
  );
  const commands: BehaviorCommand[] = [
    {
      type: "teleport",
      target: target.entityId,
      position: {
        x: goalTransform.x + ejectOffset.x,
        y: goalTransform.y + ejectOffset.y,
      },
      velocity: ejectVelocity,
    },
    {
      type: "setVelocity",
      target: target.entityId,
      velocity: ejectVelocity,
      angularVelocity: 0,
    },
    {
      type: "emitEffect",
      effect: "lounge.goal",
      params: { target: target.entityId, score: state.goalScore },
    },
  ];
  if (state.goalScore === 0) {
    commands.push({
      type: "emitEffect",
      effect: "lounge.goal-confetti",
      params: { score: state.goalScore },
    });
  }
  return commands;
}

function rearmExitedGoalTarget(
  ctx: BehaviorContext,
  effects: readonly LoungeCompositeEffect[],
  state: LoungeCompositeState,
  event: Extract<BehaviorEvent, { type: "contact.exit" }>,
) {
  const goal = goalForContact(effects, event);
  if (
    !goal ||
    cooldownFor(state, event.other.entityId) !== BLOCKED_UNTIL_SENSOR_EXIT
  ) {
    return;
  }
  setCooldown(
    state,
    event.other.entityId,
    ctx.tick + ctx.ticksFor(goal.cooldownSeconds),
  );
}

function blockEarlyGoalReentry(
  ctx: BehaviorContext,
  effects: readonly LoungeCompositeEffect[],
  state: LoungeCompositeState,
  event: Extract<BehaviorEvent, { type: "contact.enter" }>,
) {
  const goal = goalForContact(effects, event);
  const cooldownUntil = cooldownFor(state, event.other.entityId);
  if (
    !goal ||
    cooldownUntil <= ctx.tick ||
    cooldownUntil === BLOCKED_UNTIL_SENSOR_EXIT
  ) {
    return;
  }
  setCooldown(state, event.other.entityId, BLOCKED_UNTIL_SENSOR_EXIT);
}

function goalForContact(
  effects: readonly LoungeCompositeEffect[],
  event: Extract<BehaviorEvent, { type: "contact.enter" | "contact.exit" }>,
): Extract<LoungeCompositeEffect, { kind: "goal" }> | undefined {
  return effects.find(
    (effect): effect is Extract<LoungeCompositeEffect, { kind: "goal" }> =>
      effect.kind === "goal" &&
      effect.sensorId === event.selfColliderId &&
      goalAccepts(effect, event.other),
  );
}

function goalAccepts(
  effect: Extract<LoungeCompositeEffect, { kind: "goal" }>,
  target: ContactParty,
) {
  return target.tags.some((tag) => effect.acceptedDefinitionIds.includes(tag));
}

function idleMotionCommands(
  ctx: BehaviorContext,
  effects: readonly LoungeCompositeEffect[],
  elapsedTicks: number,
): BehaviorCommand[] {
  return effects.flatMap((effect) => {
    if (effect.kind === "spin") {
      return [
        {
          type: "setVelocity" as const,
          angularVelocity: effect.angularVelocity,
        },
      ];
    }
    if (effect.kind === "swing") {
      const periodTicks = Math.max(1, ctx.ticksFor(effect.periodSeconds));
      const angularFrequency = (Math.PI * 2) / effect.periodSeconds;
      return [
        {
          type: "setVelocity" as const,
          angularVelocity:
            effect.amplitudeRadians *
            angularFrequency *
            Math.cos((Math.PI * 2 * elapsedTicks) / periodTicks),
        },
      ];
    }
    return [];
  });
}

const selfRotation = (ctx: BehaviorContext) => ctx.transform()?.rotation ?? 0;

const rotate = (vector: Vec2, radians: number): Vec2 => {
  const cosine = Math.cos(radians);
  const sine = Math.sin(radians);
  return {
    x: vector.x * cosine - vector.y * sine,
    y: vector.x * sine + vector.y * cosine,
  };
};

const cooldownFor = (state: LoungeCompositeState, entityID: string) =>
  state.cooldownUntil.find(([candidate]) => candidate === entityID)?.[1] ?? 0;

function setCooldown(
  state: LoungeCompositeState,
  entityID: string,
  cooldownUntil: number,
) {
  state.cooldownUntil = [
    ...state.cooldownUntil.filter(([candidate]) => candidate !== entityID),
    [entityID, cooldownUntil] as [string, number],
  ].sort(([left], [right]) => left.localeCompare(right));
}

const BLOCKED_UNTIL_SENSOR_EXIT = Number.MAX_SAFE_INTEGER;
