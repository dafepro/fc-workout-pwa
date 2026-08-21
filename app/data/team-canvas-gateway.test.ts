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
            physics: { v: 1, sceneId: "space", sequence: 7 },
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

  it("delivers validated structured physics frames from the live stream", () => {
    const listeners = new Map<string, EventListener>();
    const close = vi.fn();
    class FakeEventSource {
      constructor(public readonly url: string) {}
      addEventListener(name: string, listener: EventListener) {
        listeners.set(name, listener);
      }
      close = close;
    }
    vi.stubGlobal("EventSource", FakeEventSource);
    const onPhysics = vi.fn();
    const onPiece = vi.fn();

    const unsubscribe = createTeamCanvasGateway("team-one").subscribe({
      onChange: vi.fn(),
      onPhysics,
      onPiece,
    });
    listeners.get("physics")?.(
      new MessageEvent("physics", {
        data: JSON.stringify({
          v: 1,
          teamId: "team-one",
          weekKey: "2026-08-17",
          sceneId: "top-down-field",
          sequence: 4,
          bodies: [],
          avatars: [],
        }),
      }),
    );

    expect(onPhysics).toHaveBeenCalledWith(
      expect.objectContaining({ sequence: 4, sceneId: "top-down-field" }),
    );
    listeners.get("piece")?.(
      new MessageEvent("piece", {
        data: '{"id":"piece-one","x":44,"y":55,"size":50,"rotation":24,"revision":4}',
      }),
    );
    expect(onPiece).toHaveBeenCalledWith(
      expect.objectContaining({ id: "piece-one", x: 44, revision: 4 }),
    );
    unsubscribe();
    expect(close).toHaveBeenCalledOnce();
  });

  it("sends transforms, deletion, and developer settings to explicit routes", async () => {
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
    await gateway.updatePiece("piece-one", {
      x: 50,
      y: 50,
      size: 44,
      rotation: 135,
    });
    await gateway.deletePiece("piece-one");
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
      "/api/zoomigo/v1/teams/team-one/canvas/pieces/piece-one",
      expect.objectContaining({
        method: "PUT",
        body: '{"x":50,"y":50,"size":44,"rotation":135}',
      }),
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      3,
      "/api/zoomigo/v1/teams/team-one/canvas/pieces/piece-one",
      expect.objectContaining({ method: "DELETE" }),
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      4,
      "/api/zoomigo/v1/teams/team-one/canvas/dev-settings",
      expect.objectContaining({ method: "PUT" }),
    );
  });
});
