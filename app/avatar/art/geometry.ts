/** Every layer is drawn in one 64x64 viewBox against this contract, so any
 * eyewear fits any head without per-combination tweaking. Heads put their pupils
 * on EYE_LINE at EYE_SPREAD either side of CENTER_X; eyewear assumes nothing
 * else about them. */
export const CENTER_X = 32;
export const EYE_LINE = 33;
export const EYE_SPREAD = 7;

export const LEFT_EYE_X = CENTER_X - EYE_SPREAD;
export const RIGHT_EYE_X = CENTER_X + EYE_SPREAD;

/** Shared ink so the eyes, noses, and lenses of different heads read as one set. */
export const INK = "#241d3d";
