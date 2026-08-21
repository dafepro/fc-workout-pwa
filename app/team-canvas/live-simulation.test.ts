import { describe, expect, it } from "vitest";
import { teamCanvasMock } from "./mock-data";
import { liveTeamFrame } from "./live-simulation";

describe("liveTeamFrame", () => {
  it("gently changes peer positions while keeping every item on the canvas", () => {
    const first = liveTeamFrame(0);
    const next = liveTeamFrame(3);

    expect(next.players[0]).not.toEqual(first.players[0]);
    expect(next.pieces[0]).not.toEqual(first.pieces[0]);
    expect(next.players).toHaveLength(teamCanvasMock.completers.length);
    expect(
      [...next.players, ...next.pieces].every(
        ({ x, y }) => x >= 6 && x <= 94 && y >= 6 && y <= 94,
      ),
    ).toBe(true);
  });
});
