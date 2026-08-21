import { teamCanvasMock } from "./mock-data";

export function liveTeamFrame(tick: number) {
  return {
    players: teamCanvasMock.completers.map((player, index) => ({
      id: player.player.id,
      x: bounded(player.x + dragOffset(tick, index, xPattern)),
      y: bounded(player.y + dragOffset(tick, index, yPattern)),
    })),
    pieces: teamCanvasMock.peerLivePieces.map((piece, index) => ({
      ...piece,
      x: bounded(piece.x + dragOffset(tick, index + 2, xPattern) * 0.85),
      y: bounded(piece.y + dragOffset(tick, index + 1, yPattern) * 0.85),
      rotation: piece.rotation + dragOffset(tick, index, rotationPattern),
    })),
  };
}

const xPattern = [0, 3.4, -2.8, 4.1, -3.6, 1.7, -1.9] as const;
const yPattern = [0, -2.6, 3.1, -1.8, 2.7, -3.3, 1.4] as const;
const rotationPattern = [0, 5, -4, 7, -6, 3, -2] as const;

function dragOffset(
  tick: number,
  itemIndex: number,
  pattern: readonly number[],
) {
  if (tick === 0) return 0;
  return pattern[(tick + itemIndex * 2) % pattern.length];
}

function bounded(value: number) {
  return Math.max(6, Math.min(94, value));
}
