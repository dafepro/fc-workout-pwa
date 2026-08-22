import type { BoardPosition } from "./model";

export interface AvatarMotionSample {
  position: BoardPosition;
  at: number;
}

export interface AvatarMomentum {
  position: BoardPosition;
  velocity: BoardPosition;
}

const sampleWindowMilliseconds = 120;
const minimumReleaseSpeed = 12;
const maximumReleaseSpeed = 85;
const stopSpeed = 3;
const boardMinimum = 6;
const boardMaximum = 94;
const boundaryBounce = 0.45;
const dampingPerSecond = 3.4;

export function avatarReleaseVelocity(
  samples: AvatarMotionSample[],
): BoardPosition {
  if (samples.length < 2) return { x: 0, y: 0 };
  const latest = samples.at(-1)!;
  const recent = samples.filter(
    ({ at }) => at >= latest.at - sampleWindowMilliseconds,
  );
  const origin = recent[0] ?? samples.at(-2)!;
  const seconds = (latest.at - origin.at) / 1000;
  if (seconds < 0.016) return { x: 0, y: 0 };

  const velocity = {
    x: (latest.position.x - origin.position.x) / seconds,
    y: (latest.position.y - origin.position.y) / seconds,
  };
  const speed = Math.hypot(velocity.x, velocity.y);
  if (speed < minimumReleaseSpeed) return { x: 0, y: 0 };
  if (speed <= maximumReleaseSpeed) return velocity;
  const scale = maximumReleaseSpeed / speed;
  return { x: velocity.x * scale, y: velocity.y * scale };
}

export function stepAvatarMomentum(
  momentum: AvatarMomentum,
  elapsedSeconds: number,
): AvatarMomentum {
  const seconds = Math.min(0.05, Math.max(0, elapsedSeconds));
  const position = {
    x: momentum.position.x + momentum.velocity.x * seconds,
    y: momentum.position.y + momentum.velocity.y * seconds,
  };
  const velocity = { ...momentum.velocity };
  bounceAxis(position, velocity, "x");
  bounceAxis(position, velocity, "y");

  const damping = Math.exp(-dampingPerSecond * seconds);
  velocity.x *= damping;
  velocity.y *= damping;
  if (Math.hypot(velocity.x, velocity.y) < stopSpeed) {
    velocity.x = 0;
    velocity.y = 0;
  }
  return { position, velocity };
}

function bounceAxis(
  position: BoardPosition,
  velocity: BoardPosition,
  axis: keyof BoardPosition,
) {
  if (position[axis] < boardMinimum) {
    position[axis] = boardMinimum;
    if (velocity[axis] < 0) velocity[axis] *= -boundaryBounce;
  } else if (position[axis] > boardMaximum) {
    position[axis] = boardMaximum;
    if (velocity[axis] > 0) velocity[axis] *= -boundaryBounce;
  }
}
