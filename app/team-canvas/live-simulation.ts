import { teamCanvasMock } from "./mock-data";

export function liveTeamFrame(tick: number) {
  return {
    players: teamCanvasMock.completers.map((player, index) => ({
      id: player.player.id,
      x: bounded(player.x + Math.sin(tick * 0.73 + index) * 1.5),
      y: bounded(player.y + Math.cos(tick * 0.61 + index * 1.7) * 1.15),
    })),
    pieces: teamCanvasMock.peerLivePieces.map((piece, index) => ({
      ...piece,
      x: bounded(piece.x + Math.sin(tick * 0.57 + index * 2.2) * 1.3),
      y: bounded(piece.y + Math.cos(tick * 0.69 + index) * 1.05),
      rotation: piece.rotation + Math.sin(tick * 0.45 + index) * 4,
    })),
  };
}

function bounded(value: number) {
  return Math.max(6, Math.min(94, value));
}
