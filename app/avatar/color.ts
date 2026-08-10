/** The one hashed player palette. It tints the initials fallback and doubles as
 * the default avatar background, so the nav, the team list, and the builder all
 * agree on a player's color. */
const PLAYER_PALETTE = [
  "#c7f23a",
  "#7be3d2",
  "#ffca63",
  "#a9b7ff",
  "#ff8f79",
  "#c99cff",
  "#66d0ff",
  "#ffd76e",
];

export function playerColor(id: string): string {
  const value = [...id].reduce(
    (total, character) => total + character.charCodeAt(0),
    0,
  );
  return PLAYER_PALETTE[value % PLAYER_PALETTE.length];
}
