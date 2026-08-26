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
  const x = (screen.x - viewport.offsetX) / viewport.scale;
  const y = (screen.y - viewport.offsetY) / viewport.scale;
  const withinCanvas =
    x >= 0 && x <= canvas.width && y >= 0 && y <= canvas.height;
  const withinDecoratingMargin = x >= 5 && x <= 95 && y >= 5 && y <= 145;
  if (!withinCanvas || !withinDecoratingMargin) return null;
  return Object.freeze({ x, y });
}
