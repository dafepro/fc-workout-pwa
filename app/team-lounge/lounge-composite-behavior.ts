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

type SensorEffect = {
  sensorId: string;
  acceptedDefinitionIds?: string[];
};

export type LoungeCompositeEffect =
  | ({ kind: "boost"; speed: number; directionRadians?: number } & SensorEffect)
  | ({ kind: "hop"; elevationSpeed: number } & SensorEffect)
  | ({
      kind: "bounce";
      impulse: number;
      directionRadians?: number;
    } & SensorEffect)
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
    } & SensorEffect)
  | ({
      kind: "cannon";
      acceptedDefinitionIds: string[];
      exitOffset: Vec2;
      speed: number;
      dwellSeconds: number;
      cooldownSeconds: number;
    } & SensorEffect)
  | ({
      kind: "flock";
      radius: number;
      lookAheadSeconds: number;
      relaxSeconds: number;
    } & SensorEffect)
  | ({
      kind: "rest";
      engageMaxSpeed: number;
      settleSpeed: number;
      animationSeconds: number;
    } & SensorEffect)
  | ({
      kind: "goalie";
      acceptedDefinitionIds: string[];
      travel: number;
      maxSpeed: number;
      trackingGain: number;
      returnGain: number;
    } & SensorEffect);

export interface LoungeCompositeConfig {
  effects: LoungeCompositeEffect[];
}

export interface LoungeCompositeState {
  elapsedTicks: number;
  cooldownUntil: [entityId: string, tick: number][];
  goalScore: number;
  flockHeading: number;
  flockIntensity: number;
  flockAlarmUntil: number;
  flockTick: number;
  flockVector: Vec2;
  motionAnchor?: Vec2;
  motionPosition?: Vec2;
  motionVelocity?: Vec2;
  goalieActiveUntil: number;
  hammockOccupied: boolean;
  hammockOccupiedUntil: number;
  bumperSequence: number;
}

export const LoungeCompositeBehavior: ItemBehavior<
  LoungeCompositeConfig,
  LoungeCompositeState
> = {
  behaviorType: "zoomigoLoungeComposite",
  stateVersion: 4,
  subscribes: [
    "contact.enter",
    "contact.stay",
    "contact.exit",
    "tick",
    "room.wake",
  ],
  initialState: () => ({
    elapsedTicks: 0,
    cooldownUntil: [],
    goalScore: 0,
    flockHeading: 0,
    flockIntensity: 0,
    flockAlarmUntil: 0,
    flockTick: -1,
    flockVector: { x: 0, y: 0 },
    goalieActiveUntil: 0,
    hammockOccupied: false,
    hammockOccupiedUntil: 0,
    bumperSequence: 0,
  }),
  onEvent(ctx, config, state, event) {
    if (event.type === "room.wake") {
      const transform = ctx.transform();
      const hasGoalie = config.effects.some(({ kind }) => kind === "goalie");
      return {
        state: {
          ...state,
          cooldownUntil: [],
          goalieActiveUntil: 0,
          motionAnchor:
            hasGoalie && transform
              ? { x: transform.x, y: transform.y }
              : state.motionAnchor,
          motionPosition:
            hasGoalie && transform
              ? { x: transform.x, y: transform.y }
              : state.motionPosition,
          motionVelocity: hasGoalie ? { x: 0, y: 0 } : state.motionVelocity,
          hammockOccupied: false,
          hammockOccupiedUntil: 0,
        },
        commands: idleMotionCommands(ctx, config.effects, state.elapsedTicks),
      };
    }

    const nextState: LoungeCompositeState = {
      elapsedTicks: state.elapsedTicks,
      cooldownUntil: [...state.cooldownUntil],
      goalScore: state.goalScore,
      flockHeading: state.flockHeading,
      flockIntensity: state.flockIntensity,
      flockAlarmUntil: state.flockAlarmUntil,
      flockTick: state.flockTick,
      flockVector: { ...state.flockVector },
      motionAnchor: state.motionAnchor ? { ...state.motionAnchor } : undefined,
      motionPosition: state.motionPosition
        ? { ...state.motionPosition }
        : undefined,
      motionVelocity: state.motionVelocity
        ? { ...state.motionVelocity }
        : undefined,
      goalieActiveUntil: state.goalieActiveUntil,
      hammockOccupied: state.hammockOccupied ?? false,
      hammockOccupiedUntil: state.hammockOccupiedUntil ?? 0,
      bumperSequence: state.bumperSequence ?? 0,
    };
    if (event.type === "tick") {
      if (config.effects.some(({ kind }) => kind === "goalie")) {
        adoptExternalGoalieMove(ctx, nextState, event.dt);
      }
      if (
        nextState.hammockOccupied &&
        ctx.tick > nextState.hammockOccupiedUntil
      ) {
        nextState.hammockOccupied = false;
      }
    }
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
  if (effect.kind === "goalie" && event.type === "tick") {
    return goalieReturnCommands(ctx, effect, state);
  }
  if (effect.kind === "flock" && event.type === "tick") {
    relaxFlock(ctx, effect, state);
    return [];
  }
  if (
    (event.type !== "contact.enter" && event.type !== "contact.stay") ||
    event.selfColliderId !== effect.sensorId ||
    (event.other.kind !== "avatar" && event.other.kind !== "item") ||
    (effect.acceptedDefinitionIds !== undefined &&
      !event.other.tags.some((tag) =>
        effect.acceptedDefinitionIds?.includes(tag),
      ))
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
      if (event.type !== "contact.enter") return [];
      if (effect.directionRadians !== undefined) state.bumperSequence += 1;
      return bounceCommands(
        ctx,
        event.other,
        effect.impulse,
        effect.directionRadians,
      );
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
    case "cannon":
      if (
        event.type === "contact.enter" &&
        cooldownFor(state, event.other.entityId) <= ctx.tick
      ) {
        return [
          {
            type: "emitEffect",
            effect: "lounge.cannon-fuse",
            params: {
              target: event.other.entityId,
              durationSeconds: effect.dwellSeconds,
            },
          },
        ];
      }
      return event.type === "contact.stay" &&
        event.dwellTicks >= ctx.ticksFor(effect.dwellSeconds)
        ? cannonCommands(ctx, event.other, effect, state)
        : [];
    case "flock":
      updateFlock(ctx, event.other, effect, state);
      return [];
    case "rest":
      return event.type === "contact.stay"
        ? restCommands(ctx, event.other, effect, state)
        : [];
    case "goalie":
      return event.type === "contact.stay"
        ? goalieTrackCommands(ctx, event.other, effect, state)
        : [];
  }
}

function updateFlock(
  ctx: BehaviorContext,
  threat: ContactParty,
  effect: Extract<LoungeCompositeEffect, { kind: "flock" }>,
  state: LoungeCompositeState,
) {
  const self = ctx.transform();
  const other = ctx.transform(threat.entityId);
  if (!self || !other || effect.radius <= 0) return;
  const velocity = ctx.velocity(threat.entityId) ?? { x: 0, y: 0 };
  const predicted = {
    x: other.x + velocity.x * effect.lookAheadSeconds,
    y: other.y + velocity.y * effect.lookAheadSeconds,
  };
  const offset = sub(self, predicted);
  const distance = Math.hypot(offset.x, offset.y);
  if (distance >= effect.radius) return;
  const away = distance > 0 ? normalize(offset) : { x: 1, y: 0 };
  const strength = (1 - distance / effect.radius) ** 2;
  if (state.flockTick !== ctx.tick) {
    state.flockTick = ctx.tick;
    state.flockVector = { x: 0, y: 0 };
  }
  state.flockVector = {
    x: state.flockVector.x + away.x * strength,
    y: state.flockVector.y + away.y * strength,
  };
  state.flockHeading = Math.atan2(state.flockVector.y, state.flockVector.x);
  state.flockIntensity = clamp(
    Math.hypot(state.flockVector.x, state.flockVector.y),
    0,
    1,
  );
  state.flockAlarmUntil = ctx.tick + ctx.ticksFor(effect.relaxSeconds);
}

function relaxFlock(
  ctx: BehaviorContext,
  effect: Extract<LoungeCompositeEffect, { kind: "flock" }>,
  state: LoungeCompositeState,
) {
  if (ctx.tick <= state.flockAlarmUntil || state.flockIntensity <= 0) return;
  const relaxTicks = Math.max(1, ctx.ticksFor(effect.relaxSeconds));
  state.flockIntensity = Math.max(0, state.flockIntensity - 1 / relaxTicks);
}

function restCommands(
  ctx: BehaviorContext,
  target: ContactParty,
  effect: Extract<LoungeCompositeEffect, { kind: "rest" }>,
  state: LoungeCompositeState,
): BehaviorCommand[] {
  if (target.kind !== "avatar") return [];
  const velocity = ctx.velocity(target.entityId) ?? { x: 0, y: 0 };
  if (Math.hypot(velocity.x, velocity.y) > effect.engageMaxSpeed) return [];
  const self = ctx.transform();
  const other = ctx.transform(target.entityId);
  if (!self || !other) return [];
  const towardCenter = sub(self, other);
  const distance = Math.hypot(towardCenter.x, towardCenter.y);
  const speed = Math.min(effect.settleSpeed, distance * 1.5);
  const direction = distance > 0.05 ? normalize(towardCenter) : { x: 0, y: 0 };
  state.hammockOccupied = true;
  state.hammockOccupiedUntil = ctx.tick + ctx.ticksFor(effect.animationSeconds);
  return [
    {
      type: "setVelocity",
      target: target.entityId,
      velocity: { x: direction.x * speed, y: direction.y * speed },
      angularVelocity: 0,
    },
  ];
}

function adoptExternalGoalieMove(
  ctx: BehaviorContext,
  state: LoungeCompositeState,
  dt: number,
) {
  const transform = ctx.transform();
  if (!transform) return;
  if (!state.motionAnchor || !state.motionPosition) {
    state.motionAnchor = { x: transform.x, y: transform.y };
    state.motionPosition = { x: transform.x, y: transform.y };
    state.motionVelocity = { x: 0, y: 0 };
    return;
  }
  const velocity = state.motionVelocity ?? { x: 0, y: 0 };
  const expected = {
    x: state.motionPosition.x + velocity.x * dt,
    y: state.motionPosition.y + velocity.y * dt,
  };
  if (Math.hypot(transform.x - expected.x, transform.y - expected.y) > 0.75) {
    state.motionAnchor = { x: transform.x, y: transform.y };
    state.motionVelocity = { x: 0, y: 0 };
    state.goalieActiveUntil = 0;
  }
  state.motionPosition = { x: transform.x, y: transform.y };
}

function goalieTrackCommands(
  ctx: BehaviorContext,
  target: ContactParty,
  effect: Extract<LoungeCompositeEffect, { kind: "goalie" }>,
  state: LoungeCompositeState,
): BehaviorCommand[] {
  const self = ctx.transform();
  const other = ctx.transform(target.entityId);
  const anchor = state.motionAnchor;
  if (!self || !other || !anchor) return [];
  const localTarget = rotate(sub(other, anchor), -self.rotation);
  const localSelf = rotate(sub(self, anchor), -self.rotation);
  const desired = clamp(localTarget.x, -effect.travel, effect.travel);
  const railSpeed = clamp(
    (desired - localSelf.x) * effect.trackingGain,
    -effect.maxSpeed,
    effect.maxSpeed,
  );
  state.goalieActiveUntil = ctx.tick + 1;
  const velocity = rotate(
    { x: railSpeed, y: -localSelf.y * effect.returnGain },
    self.rotation,
  );
  state.motionVelocity = velocity;
  return [
    {
      type: "setVelocity",
      velocity,
      angularVelocity: 0,
    },
  ];
}

function goalieReturnCommands(
  ctx: BehaviorContext,
  effect: Extract<LoungeCompositeEffect, { kind: "goalie" }>,
  state: LoungeCompositeState,
): BehaviorCommand[] {
  const self = ctx.transform();
  const anchor = state.motionAnchor;
  if (!self || !anchor || state.goalieActiveUntil >= ctx.tick) return [];
  const localSelf = rotate(sub(self, anchor), -self.rotation);
  const velocity = rotate(
    {
      x: clamp(
        -localSelf.x * effect.returnGain,
        -effect.maxSpeed,
        effect.maxSpeed,
      ),
      y: clamp(
        -localSelf.y * effect.returnGain,
        -effect.maxSpeed,
        effect.maxSpeed,
      ),
    },
    self.rotation,
  );
  state.motionVelocity = velocity;
  return [
    {
      type: "setVelocity",
      velocity,
      angularVelocity: 0,
    },
  ];
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
  directionRadians?: number,
): BehaviorCommand[] {
  const self = ctx.transform();
  const other = ctx.transform(target.entityId);
  if (!self || !other) return [];
  const direction =
    directionRadians === undefined
      ? normalize(sub(other, self))
      : rotate({ x: 1, y: 0 }, self.rotation + directionRadians);
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

function cannonCommands(
  ctx: BehaviorContext,
  target: ContactParty,
  effect: Extract<LoungeCompositeEffect, { kind: "cannon" }>,
  state: LoungeCompositeState,
): BehaviorCommand[] {
  const cannon = ctx.transform();
  if (
    !cannon ||
    !target.tags.some((tag) => effect.acceptedDefinitionIds.includes(tag)) ||
    !claimCooldown(ctx, state, target.entityId, effect.cooldownSeconds)
  ) {
    return [];
  }
  const exit = rotate(effect.exitOffset, cannon.rotation);
  const velocity = rotate({ x: effect.speed, y: 0 }, cannon.rotation);
  return [
    {
      type: "teleport",
      target: target.entityId,
      position: { x: cannon.x + exit.x, y: cannon.y + exit.y },
      velocity,
    },
    {
      type: "emitEffect",
      effect: "lounge.cannon",
      params: { target: target.entityId, speed: effect.speed },
    },
  ];
}

function claimCooldown(
  ctx: BehaviorContext,
  state: LoungeCompositeState,
  entityID: string,
  seconds: number,
): boolean {
  if (cooldownFor(state, entityID) > ctx.tick) return false;
  setCooldown(state, entityID, ctx.tick + ctx.ticksFor(seconds));
  return true;
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
