import { describe, expect, it } from "vitest";
import { defaultAvatar } from "../avatar/config";
import { mergeLoungeVisitTraces } from "./visit-traces";

describe("Team Lounge V2 visit traces", () => {
  it("shows at most three safe prior visitors and excludes live players", () => {
    const roster = ["one", "two", "three", "four", "five"].map((suffix) => ({
      playerID: `player-${suffix}`,
      displayName: `Player ${suffix}`,
      avatarConfiguration: defaultAvatar(),
    }));
    const traces = mergeLoungeVisitTraces({
      currentPlayerID: "player-one",
      visitorIDs: [
        "player-one",
        "player-two",
        "player-three",
        "player-four",
        "player-five",
        "not-on-roster",
      ],
      activePlayerIDs: ["player-two"],
      roster,
      anchors: [
        { x: 10, y: 20 },
        { x: 30, y: 40 },
        { x: 50, y: 60 },
      ],
    });

    expect(traces.map(({ playerID }) => playerID)).toEqual([
      "player-three",
      "player-four",
      "player-five",
    ]);
    expect(traces[0]).toMatchObject({
      displayName: "Player three",
      accessibleName: "Player three stopped by this week",
      screen: { x: 10, y: 20 },
    });
    expect(traces[0]).not.toHaveProperty("visitedAt");
  });
});
