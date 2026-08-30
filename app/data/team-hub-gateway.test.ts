import { afterEach, describe, expect, it, vi } from "vitest";
import { createTeamHubGateway } from "./team-hub-gateway";

afterEach(() => vi.unstubAllGlobals());

describe("connected Team Hub gateway", () => {
  it("loads the canonical private projection without caching", async () => {
    const response = {
      team: {
        id: "team-one",
        name: "Trailblazers",
        weekStart: "2026-08-10",
        weekEnd: "2026-08-16",
      },
      access: { activityUnlocked: true, loungeUnlocked: true },
      focus: [],
      activitySummary: { activeThisWeek: 1 },
      activity: [
        {
          player: {
            id: "player-ava",
            firstName: "Ava",
            lastInitial: "R",
          },
          signals: [{ kind: "active_today" }],
          reactionContext: {
            type: "team_progress",
            teamId: "team-one",
            period: "weekly",
          },
        },
      ],
      lounge: { themeId: "beach-boardwalk", title: "Team Lounge" },
    };
    const fetch = vi.fn().mockResolvedValue(Response.json(response));
    vi.stubGlobal("fetch", fetch);

    const hub = await createTeamHubGateway(true, "team-one").current();

    expect(fetch).toHaveBeenCalledWith("/api/zoomigo/v1/teams/team-one/hub", {
      cache: "no-store",
    });
    expect(hub.activity[0].player).toMatchObject({
      id: "player-ava",
      firstName: "Ava",
      lastInitial: "R.",
      initials: "AR",
    });
  });

  it("preserves reviewed API errors", async () => {
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValue(
          Response.json(
            { error: { code: "not_ready", message: "Try later." } },
            { status: 503 },
          ),
        ),
    );

    await expect(
      createTeamHubGateway(true, "team-one").current(),
    ).rejects.toMatchObject({ code: "not_ready", message: "Try later." });
  });
});
