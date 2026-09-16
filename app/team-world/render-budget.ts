/** Keep fullscreen raster work bounded without changing geometry, ink, or physics. */
export function renderPixelRatio(
  width: number,
  height: number,
  deviceRatio: number,
) {
  const pixels = Math.max(1, width) * Math.max(1, height);
  return Math.min(deviceRatio, 1.5, Math.sqrt(1_500_000 / pixels));
}
