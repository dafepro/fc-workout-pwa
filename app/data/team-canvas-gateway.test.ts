import { afterEach, describe, expect, it, vi } from "vitest";
import { createTeamCanvasGateway } from "./team-canvas-gateway";

afterEach(() => vi.unstubAllGlobals());

describe("HTTP team canvas gateway", () => {
  it("maps durable member, stamp-image, settings, and reward fields", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            team: { id: "team-one", name: "Trailblazers", weeklyGoal: 3 },
            dayKey: "2026-08-21",
            weekKey: "2026-08-17",
            settings: {
              backgroundAssetId: "cosmic-stadium",
              backgroundColor: "#112233",
              textColor: "#FFFFFF",
              textSize: 120,
              textStyle: "bubble",
              stampChoices: [
                "spark-cleat",
                "zoomigo-mark",
                "bolt",
                "star",
                "rocket",
              ],
              revision: 2,
            },
            stampChoices: [
              "spark-cleat",
              "zoomigo-mark",
              "bolt",
              "star",
              "rocket",
            ],
            members: [
              {
                playerId: "player-one",
                firstName: "Ava",
                lastInitial: "R",
                avatarConfiguration: { head: "fox" },
                position: { x: 42, y: 58 },
                starDayKeys: ["2026-08-21"],
              },
            ],
            pieces: [
              {
                id: "piece-one",
                dayKey: "2026-08-21",
                assetId: "spark-cleat",
                status: "live",
                editable: true,
                revision: 3,
                x: 50,
                y: 45,
                size: 60,
                rotation: 12,
              },
            ],
            avatarPosition: { x: 42, y: 58 },
            availableRewards: 1,
            cooldownComplete: false,
            developerControlsEnabled: true,
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        ),
      ),
    );

    const projection = await createTeamCanvasGateway("team-one").load();

    expect(projection.members[0].avatarConfiguration).toEqual({ head: "fox" });
    expect(projection.pieces[0].asset).toMatchObject({
      kind: "image",
      src: "/team-canvas/stamps/spark-cleat.png",
    });
    expect(projection.settings.backgroundAssetId).toBe("cosmic-stadium");
    expect(projection.availableRewards).toBe(1);
  });

  it("sends bounded transforms and developer settings to explicit routes", async () => {
    const fetchMock = vi.fn().mockImplementation(() =>
      Promise.resolve(
        new Response(JSON.stringify({ x: 84, y: 12 }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }),
      ),
    );
    vi.stubGlobal("fetch", fetchMock);
    const gateway = createTeamCanvasGateway("team-one");

    await gateway.moveAvatar({ x: 84, y: 12 });
    await gateway.saveSettings({
      backgroundAssetId: "soccer-field",
      backgroundColor: "#AABBCC",
      textColor: "#112233",
      textSize: 112,
      textStyle: "rally",
      stampChoices: ["bolt", "star", "rocket", "spark-cleat", "zoomigo-mark"],
      revision: 0,
    });

    expect(fetchMock).toHaveBeenNthCalledWith(
      1,
      "/api/zoomigo/v1/teams/team-one/canvas/avatar",
      expect.objectContaining({ method: "PUT", body: '{"x":84,"y":12}' }),
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      "/api/zoomigo/v1/teams/team-one/canvas/dev-settings",
      expect.objectContaining({ method: "PUT" }),
    );
  });
});
