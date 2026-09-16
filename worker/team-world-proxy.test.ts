import { expect, it } from "vitest";
import { teamWorldUpstream } from "./team-world-proxy";
const env = {
  DEV_ACCESS_ENABLED: "true",
  ZOOMIGO_API_BASE_URL: "https://api-dev.example",
  ZOOMIGO_API_GATEWAY_TOKEN: "private-gateway",
};
it("forwards only the gated socket route and required handshake headers", () => {
  const request = new Request("https://dev.example/room?unexpected=secret", {
    headers: {
      Upgrade: "websocket",
      Origin: "https://dev.example",
      Cookie: "session=private",
      Authorization: "Bearer private",
      "Sec-WebSocket-Key": "key",
    },
  });
  const next = teamWorldUpstream(request, env)!;
  expect(next.url).toBe("https://api-dev.example/room");
  expect(next.headers.get("X-Zoomigo-Dev-Gateway")).toBe("private-gateway");
  expect(next.headers.get("Cookie")).toBeNull();
  expect(next.headers.get("Authorization")).toBeNull();
  expect(next.headers.get("Origin")).toBe("https://dev.example");
});
it("does not forward other routes, origins, ordinary requests or production traffic", () => {
  for (const request of [
    new Request("https://dev.example/room"),
    new Request("https://dev.example/elsewhere", {
      headers: { Upgrade: "websocket", Origin: "https://dev.example" },
    }),
    new Request("https://dev.example/room", {
      headers: { Upgrade: "websocket", Origin: "https://evil.example" },
    }),
  ])
    expect(teamWorldUpstream(request, env)).toBeNull();
  expect(
    teamWorldUpstream(new Request("https://dev.example/room"), {
      ...env,
      DEV_ACCESS_ENABLED: "false",
    }),
  ).toBeNull();
});
