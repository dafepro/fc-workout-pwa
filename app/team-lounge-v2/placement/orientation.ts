export const LOUNGE_STAMP_ROTATIONS = [-Math.PI / 12, 0, Math.PI / 12] as const;

export const LOUNGE_STAMP_ORIENTATION_POLICY = {
  rotations: LOUNGE_STAMP_ROTATIONS,
  canMirror: false,
} as const;

export function loungeStampRotation(rotation: number): number {
  return LOUNGE_STAMP_ROTATIONS.reduce((closest, candidate) =>
    Math.abs(candidate - rotation) < Math.abs(closest - rotation)
      ? candidate
      : closest,
  );
}
