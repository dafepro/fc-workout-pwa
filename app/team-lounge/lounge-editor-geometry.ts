const fullTurn = 2 * Math.PI;
const rotationStep = Math.PI / 12;

export function loungeItemCenterStyle(
  screen: Readonly<{ x: number; y: number }>,
) {
  return {
    "--lounge-item-center-x": `${screen.x}px`,
    "--lounge-item-center-y": `${screen.y}px`,
  } as const;
}

interface LoungeViewport {
  width: number;
  height: number;
  scale: number;
  offsetX: number;
  offsetY: number;
}

export function loungeWorldPoint(
  screen: Readonly<{ x: number; y: number }>,
  viewport: Readonly<LoungeViewport>,
  canvas: Readonly<{ width: number; height: number }>,
): Readonly<{ x: number; y: number }> | null {
  if (
    !Number.isFinite(screen.x) ||
    !Number.isFinite(screen.y) ||
    !Number.isFinite(viewport.scale) ||
    viewport.scale <= 0
  ) {
    return null;
  }
  const point = {
    x: (screen.x - viewport.offsetX) / viewport.scale,
    y: (screen.y - viewport.offsetY) / viewport.scale,
  };
  return point.x >= 5 &&
    point.x <= Math.min(95, canvas.width - 5) &&
    point.y >= 5 &&
    point.y <= Math.min(145, canvas.height - 5)
    ? point
    : null;
}

export function clampLoungeItemScale(scale: number, maximum = 1.4): number {
  return Math.min(maximum, Math.max(0.75, Math.round(scale * 10) / 10));
}

export function nextLoungeItemRotation(
  rotation: number,
  direction: -1 | 1,
): number {
  const current = Number.isFinite(rotation) ? rotation : 0;
  const stepped =
    Math.round(current / rotationStep) * rotationStep +
    direction * rotationStep;
  const normalized =
    ((((stepped + Math.PI) % fullTurn) + fullTurn) % fullTurn) - Math.PI;
  return Math.abs(normalized) < 1e-12 ? 0 : normalized;
}
