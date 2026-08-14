import { describe, expect, it } from "vitest";
import { identityForSession, pseudonymize } from "./identity";

const session = {
  player: {
    id: "player-private-id",
    teams: [
      {
        id: "team-private-id",
        name: "Team name must not be stored",
        timeZone: "America/Chicago",
      },
    ],
  },
};

describe("analytics identity", () => {
  it("is stable and distinct across raw identifiers", async () => {
    const first = await pseudonymize("player-private-id", "a".repeat(32));
    expect(first).toBe(await pseudonymize("player-private-id", "a".repeat(32)));
    expect(first).not.toBe(
      await pseudonymize("another-player", "a".repeat(32)),
    );
    expect(first).not.toContain("player-private-id");
  });

  it("projects only pseudonyms and the time zone", async () => {
    const identity = await identityForSession(session, "a".repeat(32));
    expect(identity).toMatchObject({ timeZone: "America/Chicago" });
    expect(JSON.stringify(identity)).not.toContain("player-private-id");
    expect(JSON.stringify(identity)).not.toContain("team-private-id");
    expect(JSON.stringify(identity)).not.toContain("Team name");
  });
});
