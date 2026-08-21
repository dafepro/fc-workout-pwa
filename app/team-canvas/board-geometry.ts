import type { BoardTransform } from "./model";

export interface GesturePoint {
  id: number;
  x: number;
  y: number;
}

export interface StarCrownPoint {
  angle: number;
  left: number;
  top: number;
}

export function isPointInTrashDropZone(
  point: Pick<GesturePoint, "x" | "y">,
  board: { left: number; top: number; width: number; height: number },
) {
  const target = {
    x: board.left + board.width / 2,
    y: board.top + board.height - 52,
  };
  return Math.hypot(point.x - target.x, point.y - target.y) <= 46;
}

export function starCrownLayout(count: number): StarCrownPoint[] {
  const safeCount = Math.max(0, Math.min(7, Math.round(count)));
  const step = 18;
  const firstAngle = 270 - ((safeCount - 1) * step) / 2;
  return Array.from({ length: safeCount }, (_, index) => {
    const angle = firstAngle + index * step;
    return {
      angle,
      left: 50 + Math.cos((angle * Math.PI) / 180) * 41,
      top: 52 + Math.sin((angle * Math.PI) / 180) * 47,
    };
  });
}

export function gestureTransform(
  base: BoardTransform,
  start: GesturePoint[],
  current: GesturePoint[],
  board: { width: number; height: number },
): BoardTransform {
  const pairs = start
    .map((point) => ({
      start: point,
      current: current.find(({ id }) => id === point.id),
    }))
    .filter((pair): pair is { start: GesturePoint; current: GesturePoint } =>
      Boolean(pair.current),
    )
    .slice(0, 2);

  if (pairs.length === 0 || board.width === 0 || board.height === 0) {
    return base;
  }

  const startCenter = center(pairs.map(({ start: point }) => point));
  const currentCenter = center(pairs.map(({ current: point }) => point));
  const moved = {
    x: base.x + ((currentCenter.x - startCenter.x) / board.width) * 100,
    y: base.y + ((currentCenter.y - startCenter.y) / board.height) * 100,
  };

  if (pairs.length === 1) return { ...base, ...moved };

  const startVector = vector(pairs[0].start, pairs[1].start);
  const currentVector = vector(pairs[0].current, pairs[1].current);
  const scale = length(currentVector) / Math.max(1, length(startVector));

  return {
    ...moved,
    size: base.size * scale,
    rotation:
      base.rotation +
      ((Math.atan2(currentVector.y, currentVector.x) -
        Math.atan2(startVector.y, startVector.x)) *
        180) /
        Math.PI,
  };
}

function center(points: GesturePoint[]) {
  return points.reduce(
    (result, point) => ({
      x: result.x + point.x / points.length,
      y: result.y + point.y / points.length,
    }),
    { x: 0, y: 0 },
  );
}

function vector(first: GesturePoint, second: GesturePoint) {
  return { x: second.x - first.x, y: second.y - first.y };
}

function length(point: { x: number; y: number }) {
  return Math.hypot(point.x, point.y);
}
