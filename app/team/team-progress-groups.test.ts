import { describe, expect, it } from "vitest";

import { teamProgressGroups } from "./team-progress-groups";

describe("player Team progress groups", () => {
  it("states the weekly-goal meaning without the retired labels", () => {
    const groups = teamProgressGroups(3);

    expect(groups.map(({ title, rule }) => ({ title, rule }))).toEqual([
      {
        title: "Reached the 3-session goal",
        rule: "3 or more sessions this week",
      },
      {
        title: "One session away",
        rule: "Exactly 2 sessions this week",
      },
      {
        title: "Working towards it",
        rule: "Fewer than 2 sessions this week",
      },
    ]);
    expect(groups.map((group) => group.title).join(" ")).not.toMatch(
      /Completed|One Away|Keep Going/i,
    );
  });
});
