import { afterEach, describe, expect, it, vi } from "vitest";

const { recordServerEventsForRequest } = vi.hoisted(() => ({
  recordServerEventsForRequest: vi.fn(),
}));

vi.mock("../../backend", () => ({
  backendBaseURL: () => "http://api:8080",
  backendHeaders: (initial?: HeadersInit) => new Headers(initial),
  forwardedHeaders: () => new Headers({ "Cache-Control": "no-store" }),
  jsonError: (status: number, code: string, message: string) =>
    Response.json({ error: { code, message } }, { status }),
  limitedBody: (request: Request) => request.text(),
  missingBackendCode: () => "backend_not_configured",
  readSessionCookie: () => "player-session",
  sameOrigin: () => true,
}));

vi.mock("../../../../lib/analytics/proxy-events", () => ({
  proxyEvents: () => [],
}));

vi.mock("../../../../lib/analytics/server", () => ({
  recordServerEventsForRequest,
}));

import { POST } from "./route";

afterEach(() => {
  vi.unstubAllGlobals();
  recordServerEventsForRequest.mockReset();
});

describe("Zoomigo API proxy", () => {
  it("forwards the development Lounge catalog-unlock action", async () => {
    const fetchMock = vi.fn().mockResolvedValue(Response.json({ granted: 7 }));
    vi.stubGlobal("fetch", fetchMock);

    const response = await POST(
      new Request(
        "https://dev.zoomigo.example/api/zoomigo/__dev/me/lounge-unlocks",
        { method: "POST" },
      ),
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ granted: 7 });
    expect(fetchMock).toHaveBeenCalledWith(
      "http://api:8080/__dev/me/lounge-unlocks",
      expect.objectContaining({
        method: "POST",
        headers: expect.any(Headers),
      }),
    );
    expect(
      (fetchMock.mock.calls[0]?.[1]?.headers as Headers).get("Authorization"),
    ).toBe("Bearer player-session");
  });

  it("keeps unrelated development operations outside the player proxy", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    const response = await POST(
      new Request("https://dev.zoomigo.example/api/zoomigo/__dev/reset", {
        method: "POST",
      }),
    );

    expect(response.status).toBe(404);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
