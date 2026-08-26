const FULL_TURN = 2 * Math.PI;

export const LOUNGE_STAMP_ROTATION_STEP = Math.PI / 12;

export const LOUNGE_STAMP_ORIENTATION_POLICY = {
  stepRadians: LOUNGE_STAMP_ROTATION_STEP,
  canMirror: false,
} as const;

export function normalizeLoungeStampRotation(rotation: number): number {
  if (!Number.isFinite(rotation)) return 0;
  const normalized =
    ((((rotation + Math.PI) % FULL_TURN) + FULL_TURN) % FULL_TURN) - Math.PI;
  return Math.abs(normalized) < 1e-12 ? 0 : normalized;
}

export function nextLoungeStampRotation(
  rotation: number,
  direction: -1 | 1,
): number {
  const snapped =
    Math.round(
      normalizeLoungeStampRotation(rotation) / LOUNGE_STAMP_ROTATION_STEP,
    ) * LOUNGE_STAMP_ROTATION_STEP;
  return normalizeLoungeStampRotation(
    snapped + direction * LOUNGE_STAMP_ROTATION_STEP,
  );
}
