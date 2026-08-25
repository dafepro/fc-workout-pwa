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
              developerStampLimit: 6,
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

  it("retries the socket without creating the retired EventSource fallback", async () => {
    const eventSource = vi.fn();
    const fetchMock = vi.fn().mockRejectedValue(new Error("offline"));
    vi.stubGlobal("EventSource", eventSource);
    vi.stubGlobal("fetch", fetchMock);
    const onLifecycle = vi.fn();

    const unsubscribe = createTeamCanvasGateway("team-one").subscribe({
      onChange: vi.fn(),
      onPhysics: vi.fn(),
      onPiece: vi.fn(),
      onLifecycle,
    });
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledOnce());

    expect(onLifecycle).toHaveBeenCalledWith("connecting");
    expect(eventSource).not.toHaveBeenCalled();
    unsubscribe();
  });

  it("uses the authenticated socket for latest avatar targets and room frames", async () => {
    const sent: string[] = [];
    const sockets: FakeWebSocket[] = [];
    class FakeWebSocket {
      static readonly OPEN = 1;
      readonly readyState = FakeWebSocket.OPEN;
      onmessage: ((event: MessageEvent) => void) | null = null;
      onclose: (() => void) | null = null;
      onerror: (() => void) | null = null;
      constructor(
        public readonly url: string,
        public readonly protocols: string[],
      ) {
        sockets.push(this);
      }
      send(value: string) {
        sent.push(value);
      }
      close() {}
    }
    vi.stubGlobal("WebSocket", FakeWebSocket);
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            ticket: "one-time-ticket",
            socketUrl: "ws://localhost:8080/v1/teams/team-one/canvas/socket",
          }),
          { status: 201, headers: { "Content-Type": "application/json" } },
        ),
      ),
    );
    const onPhysics = vi.fn();
    const gateway = createTeamCanvasGateway("team-one");
    const unsubscribe = gateway.subscribe({
      onChange: vi.fn(),
      onPhysics,
      onPiece: vi.fn(),
    });
    await vi.waitFor(() => expect(sockets).toHaveLength(1));
    const socket = sockets[0];

    expect(socket.url).toBe(
      "ws://localhost:8080/v1/teams/team-one/canvas/socket",
    );
    expect(socket.protocols).toEqual([
      "zoomigo.team-canvas.v1",
      "ticket.one-time-ticket",
    ]);
    socket.onmessage?.(
      new MessageEvent("message", {
        data: JSON.stringify({
          v: 1,
          type: "physics.frame",
          frame: {
            v: 1,
            teamId: "team-one",
            weekKey: "2026-08-17",
            sceneId: "top-down-field",
            sequence: 9,
            bodies: [],
            avatars: [],
          },
        }),
      }),
    );
    await gateway.moveAvatar({ x: 72, y: 48 });

    expect(onPhysics).toHaveBeenCalledWith(
      expect.objectContaining({ sequence: 9 }),
    );
    expect(JSON.parse(sent.at(-1) ?? "{}")).toMatchObject({
      v: 1,
      type: "avatar.target",
      position: { x: 72, y: 48 },
    });
    unsubscribe();
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
      developerStampLimit: 8,
      revision: 0,
    });

    expect(fetchMock).toHaveBeenNthCalledWith(
      1,
      "/api/zoomigo/v1/teams/team-one/canvas/pieces/piece-one",
      expect.objectContaining({
        method: "PUT",
        body: '{"x":50,"y":50,"size":44,"rotation":135}',
      }),
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      "/api/zoomigo/v1/teams/team-one/canvas/pieces/piece-one",
      expect.objectContaining({ method: "DELETE" }),
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      3,
      "/api/zoomigo/v1/teams/team-one/canvas/dev-settings",
      expect.objectContaining({ method: "PUT" }),
    );
    expect(JSON.parse(fetchMock.mock.calls[2][1].body)).toMatchObject({
      developerStampLimit: 8,
    });
  });
});
