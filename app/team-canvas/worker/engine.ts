import type {
  PhysicsBodyState,
  PhysicsVector,
  TeamCanvasPhysicsFrame,
} from "../physics";

interface Behavior {
  radiusScale: number;
  mass: number;
  restitution: number;
  gravityScale: number;
  damping: number;
  maximumSpeed: number;
}

interface Scene {
  gravity: PhysicsVector;
  damping: number;
  restitution: number;
}

interface AvatarSample {
  position: PhysicsVector;
  target: PhysicsVector;
  velocity: PhysicsVector;
  at: number;
}

const behaviors: Record<string, Behavior> = {
  soccer: {
    radiusScale: 0.92,
    mass: 1,
    restitution: 0.92,
    gravityScale: 1,
    damping: 0.04,
    maximumSpeed: 52,
  },
  balloon: {
    radiusScale: 0.82,
    mass: 0.45,
    restitution: 0.55,
    gravityScale: -0.55,
    damping: 0.34,
    maximumSpeed: 22,
  },
  rocket: {
    radiusScale: 0.84,
    mass: 1.7,
    restitution: 0.68,
    gravityScale: 0.35,
    damping: 0.04,
    maximumSpeed: 38,
  },
};

const scenes: Record<TeamCanvasPhysicsFrame["sceneId"], Scene> = {
  "top-down-field": {
    gravity: { x: 0, y: 0 },
    damping: 0.34,
    restitution: 0.84,
  },
  "side-view": {
    gravity: { x: 0, y: 28 },
    damping: 0.1,
    restitution: 0.75,
  },
  space: {
    gravity: { x: 0, y: 0 },
    damping: 0.035,
    restitution: 0.9,
  },
};

const avatarRadius = 4.2;
const maximumAvatarSpeed = 85;

export class ClientPhysicsWorld {
  private source: TeamCanvasPhysicsFrame;
  private readonly bodies = new Map<string, PhysicsBodyState>();
  private readonly avatars = new Map<string, AvatarSample>();
  private contacts = new Set<string>();

  constructor(frame: TeamCanvasPhysicsFrame) {
    this.source = cloneFrame(frame);
    this.replace(frame);
  }

  moveAvatar(playerID: string, target: PhysicsVector, at: number) {
    if (!finiteVector(target)) return;
    const previous = this.avatars.get(playerID);
    if (!previous) {
      this.avatars.set(playerID, {
        position: { ...target },
        target: { ...target },
        velocity: { x: 0, y: 0 },
        at,
      });
      return;
    }
    if (at <= previous.at) return;
    const delta = subtract(target, previous.position);
    const duration = Math.min(0.5, Math.max(0.04, (at - previous.at) / 1000));
    previous.target = { ...target };
    previous.velocity = clampVector(
      scale(delta, 1 / duration),
      maximumAvatarSpeed,
    );
    previous.at = at;
  }

  transformBody(
    bodyID: string,
    transform: { x: number; y: number; size: number; rotation: number },
  ) {
    const body = this.bodies.get(bodyID);
    if (
      !body ||
      !finiteVector(transform) ||
      !Number.isFinite(transform.size) ||
      !Number.isFinite(transform.rotation)
    ) {
      return;
    }
    body.position = { x: transform.x, y: transform.y };
    body.velocity = { x: 0, y: 0 };
    body.size = transform.size;
    body.angle = normalizeAngle(transform.rotation);
    body.angularVelocity = 0;
    body.sleeping = false;
  }

  step(seconds: number) {
    if (!Number.isFinite(seconds) || seconds <= 0 || seconds > 0.1) return;
    const scene = scenes[this.source.sceneId];
    for (const body of this.bodies.values()) {
      if (body.recovering || body.sleeping) continue;
      const behavior = behaviors[body.assetId];
      if (!behavior) continue;
      body.velocity.x += scene.gravity.x * behavior.gravityScale * seconds;
      body.velocity.y += scene.gravity.y * behavior.gravityScale * seconds;
      const damping = Math.exp(-(scene.damping + behavior.damping) * seconds);
      body.velocity = clampVector(
        scale(body.velocity, damping),
        behavior.maximumSpeed,
      );
      body.angularVelocity = clamp(body.angularVelocity * damping, -360, 360);
      body.position.x += body.velocity.x * seconds;
      body.position.y += body.velocity.y * seconds;
      body.angle = normalizeAngle(body.angle + body.angularVelocity * seconds);
      this.resolveBounds(body);
    }
    this.advanceAvatars(seconds);
    this.resolveBodyCollisions();
    this.source.sequence++;
  }

  reconcile(frame: TeamCanvasPhysicsFrame, canonical = false): boolean {
    if (
      frame.teamId !== this.source.teamId ||
      (!canonical &&
        (frame.weekKey !== this.source.weekKey ||
          frame.sceneId !== this.source.sceneId ||
          frame.sequence <= this.source.sequence))
    ) {
      return false;
    }
    this.replace(
      canonical && frame.sequence < this.source.sequence
        ? { ...frame, sequence: this.source.sequence }
        : frame,
    );
    return true;
  }

  frame(): TeamCanvasPhysicsFrame {
    return {
      ...this.source,
      bodies: [...this.bodies.values()]
        .sort((first, second) => first.id.localeCompare(second.id))
        .map(cloneBody),
      avatars: [...this.avatars.entries()]
        .sort(([first], [second]) => first.localeCompare(second))
        .map(([playerId, avatar]) => ({
          playerId,
          position: { ...avatar.position },
        })),
      resets: [],
    };
  }

  private replace(frame: TeamCanvasPhysicsFrame) {
    this.source = cloneFrame(frame);
    this.bodies.clear();
    for (const body of frame.bodies) {
      if (behaviors[body.assetId]) this.bodies.set(body.id, cloneBody(body));
    }
    const nextAvatars = new Map<string, AvatarSample>();
    for (const avatar of frame.avatars) {
      const current = this.avatars.get(avatar.playerId);
      nextAvatars.set(avatar.playerId, {
        position: { ...avatar.position },
        target: current?.target ?? { ...avatar.position },
        velocity: current?.velocity ?? { x: 0, y: 0 },
        at: current?.at ?? 0,
      });
    }
    this.avatars.clear();
    nextAvatars.forEach((avatar, playerID) =>
      this.avatars.set(playerID, avatar),
    );
    this.contacts.clear();
  }

  private advanceAvatars(seconds: number) {
    const nextContacts = new Set<string>();
    for (const [playerID, avatar] of [...this.avatars.entries()].sort()) {
      const start = { ...avatar.position };
      const remaining = subtract(avatar.target, start);
      const movement = scale(avatar.velocity, seconds);
      if (
        length(remaining) < 0.001 ||
        dot(movement, remaining) <= 0 ||
        length(movement) >= length(remaining)
      ) {
        avatar.position = { ...avatar.target };
        avatar.velocity = { x: 0, y: 0 };
      } else {
        avatar.position = add(start, movement);
      }
      this.resolveAvatarContacts(
        playerID,
        start,
        avatar.position,
        avatar.velocity,
        nextContacts,
      );
    }
    this.contacts = nextContacts;
  }

  private resolveAvatarContacts(
    playerID: string,
    start: PhysicsVector,
    end: PhysicsVector,
    avatarVelocity: PhysicsVector,
    nextContacts: Set<string>,
  ) {
    for (const body of this.bodies.values()) {
      const behavior = behaviors[body.assetId];
      if (!behavior || body.recovering) continue;
      const minimumDistance = radius(body) + avatarRadius;
      const closest = closestPoint(body.position, start, end);
      const contactDistance = distance(body.position, closest);
      const key = `${playerID}\0${body.id}`;
      if (contactDistance > minimumDistance + 0.8) continue;
      if (contactDistance > minimumDistance) {
        if (this.contacts.has(key)) nextContacts.add(key);
        continue;
      }
      nextContacts.add(key);
      let normal = normalized(subtract(body.position, closest));
      if (length(normal) < 0.001) normal = normalized(avatarVelocity);
      const endDelta = subtract(body.position, end);
      const endDistance = length(endDelta);
      if (endDistance < minimumDistance) {
        const separation = normalized(endDelta);
        body.position = add(
          body.position,
          scale(separation, minimumDistance - endDistance + 0.001),
        );
        normal = separation;
        this.resolveBounds(body);
      }
      if (!this.contacts.has(key)) {
        const approach = dot(subtract(avatarVelocity, body.velocity), normal);
        if (approach > 1) {
          const desired = Math.min(
            behavior.maximumSpeed * 0.92,
            Math.max(
              behavior.maximumSpeed * 0.55,
              approach * (1 + behavior.restitution),
            ),
          );
          const current = dot(body.velocity, normal);
          if (desired > current)
            body.velocity = add(
              body.velocity,
              scale(normal, desired - current),
            );
          body.angularVelocity = clamp(
            body.angularVelocity +
              ((normal.x + normal.y) * 64) / Math.max(behavior.mass, 0.1),
            -360,
            360,
          );
        }
      }
      body.sleeping = false;
      body.velocity = clampVector(body.velocity, behavior.maximumSpeed);
    }
  }

  private resolveBodyCollisions() {
    const bodies = [...this.bodies.values()].sort((first, second) =>
      first.id.localeCompare(second.id),
    );
    for (let iteration = 0; iteration < 4; iteration++) {
      for (let firstIndex = 0; firstIndex < bodies.length; firstIndex++) {
        for (
          let secondIndex = firstIndex + 1;
          secondIndex < bodies.length;
          secondIndex++
        ) {
          const first = bodies[firstIndex];
          const second = bodies[secondIndex];
          if (first.recovering || second.recovering) continue;
          const delta = subtract(second.position, first.position);
          const separation = length(delta);
          const minimum = radius(first) + radius(second);
          if (separation >= minimum) continue;
          const normal =
            separation > 0.0001 ? scale(delta, 1 / separation) : { x: 1, y: 0 };
          const firstBehavior = behaviors[first.assetId];
          const secondBehavior = behaviors[second.assetId];
          const inverseFirst = 1 / firstBehavior.mass;
          const inverseSecond = 1 / secondBehavior.mass;
          const correction = scale(
            normal,
            (minimum - separation + 0.001) / (inverseFirst + inverseSecond),
          );
          first.position = subtract(
            first.position,
            scale(correction, inverseFirst),
          );
          second.position = add(
            second.position,
            scale(correction, inverseSecond),
          );
          this.resolveBounds(first);
          this.resolveBounds(second);
          const relative = subtract(second.velocity, first.velocity);
          const alongNormal = dot(relative, normal);
          if (alongNormal < 0) {
            const restitution = Math.min(
              firstBehavior.restitution,
              secondBehavior.restitution,
            );
            const amount =
              (-(1 + restitution) * alongNormal) /
              (inverseFirst + inverseSecond);
            const impulse = scale(normal, amount);
            first.velocity = subtract(
              first.velocity,
              scale(impulse, inverseFirst),
            );
            second.velocity = add(
              second.velocity,
              scale(impulse, inverseSecond),
            );
          }
        }
      }
    }
  }

  private resolveBounds(body: PhysicsBodyState) {
    const behavior = behaviors[body.assetId];
    const bodyRadius = radius(body);
    const minimum = Math.max(bodyRadius, 6);
    const maximum = Math.min(100 - bodyRadius, 94);
    const restitution = Math.min(
      behavior.restitution,
      scenes[this.source.sceneId].restitution,
    );
    if (body.position.x < minimum) {
      body.position.x = minimum;
      if (body.velocity.x < 0) body.velocity.x *= -restitution;
    } else if (body.position.x > maximum) {
      body.position.x = maximum;
      if (body.velocity.x > 0) body.velocity.x *= -restitution;
    }
    if (body.position.y < minimum) {
      body.position.y = minimum;
      if (body.velocity.y < 0) body.velocity.y *= -restitution;
    } else if (body.position.y > maximum) {
      body.position.y = maximum;
      if (body.velocity.y > 0) body.velocity.y *= -restitution;
    }
  }
}

function radius(body: PhysicsBodyState) {
  return ((body.size / 400) * 100 * behaviors[body.assetId].radiusScale) / 2;
}

function cloneFrame(frame: TeamCanvasPhysicsFrame): TeamCanvasPhysicsFrame {
  return {
    ...frame,
    bodies: frame.bodies.map(cloneBody),
    avatars: frame.avatars.map((avatar) => ({
      playerId: avatar.playerId,
      position: { ...avatar.position },
    })),
    resets: [...frame.resets],
  };
}

function cloneBody(body: PhysicsBodyState): PhysicsBodyState {
  return {
    ...body,
    position: { ...body.position },
    velocity: { ...body.velocity },
  };
}

function closestPoint(
  point: PhysicsVector,
  start: PhysicsVector,
  end: PhysicsVector,
) {
  const segment = subtract(end, start);
  const square = dot(segment, segment);
  if (square === 0) return start;
  const amount = clamp(dot(subtract(point, start), segment) / square, 0, 1);
  return add(start, scale(segment, amount));
}

function normalized(vector: PhysicsVector): PhysicsVector {
  const size = length(vector);
  return size < 0.000001 ? { x: 1, y: 0 } : scale(vector, 1 / size);
}

function clampVector(vector: PhysicsVector, maximum: number): PhysicsVector {
  const size = length(vector);
  return size <= maximum || size === 0 ? vector : scale(vector, maximum / size);
}

function add(first: PhysicsVector, second: PhysicsVector): PhysicsVector {
  return { x: first.x + second.x, y: first.y + second.y };
}

function subtract(first: PhysicsVector, second: PhysicsVector): PhysicsVector {
  return { x: first.x - second.x, y: first.y - second.y };
}

function scale(vector: PhysicsVector, amount: number): PhysicsVector {
  return { x: vector.x * amount, y: vector.y * amount };
}

function dot(first: PhysicsVector, second: PhysicsVector) {
  return first.x * second.x + first.y * second.y;
}

function length(vector: PhysicsVector) {
  return Math.hypot(vector.x, vector.y);
}

function distance(first: PhysicsVector, second: PhysicsVector) {
  return length(subtract(first, second));
}

function finiteVector(vector: PhysicsVector) {
  return Number.isFinite(vector.x) && Number.isFinite(vector.y);
}

function normalizeAngle(angle: number) {
  return ((((angle + 180) % 360) + 360) % 360) - 180;
}

function clamp(value: number, minimum: number, maximum: number) {
  return Math.max(minimum, Math.min(maximum, value));
}
