import { describe, expect, it } from "vitest";
import { teamCanvasMock } from "./mock-data";
import { liveTeamFrame } from "./live-simulation";

describe("liveTeamFrame", () => {
  it("uses short, deterministic drag-like jumps while keeping items on canvas", () => {
    const first = liveTeamFrame(0);
    const next = liveTeamFrame(1);

    expect(next.players[0]).not.toEqual(first.players[0]);
    expect(next.pieces[0]).not.toEqual(first.pieces[0]);
    expect(next.players).toHaveLength(teamCanvasMock.completers.length);
    expect(
      Math.hypot(
        next.players[0].x - first.players[0].x,
        next.players[0].y - first.players[0].y,
      ),
    ).toBeGreaterThan(2);
    expect(liveTeamFrame(1)).toEqual(next);
    expect(
      [...next.players, ...next.pieces].every(
        ({ x, y }) => x >= 6 && x <= 94 && y >= 6 && y <= 94,
      ),
    ).toBe(true);
  });
});
