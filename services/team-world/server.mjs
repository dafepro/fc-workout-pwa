import { createServer } from "node:http";
import { createRoomService } from "zmap/server";
import { cannonBehavior } from "zmap";
import map from "../../app/team-world/world.json" with { type: "json" };
import { createAuthority } from "./authority.mjs";

const key = process.env.TEAM_WORLD_RELAY_KEY;
const origin = process.env.TEAM_WORLD_ALLOWED_ORIGIN;
const api = process.env.TEAM_WORLD_API_URL;
if (!key || key.length < 32 || !origin || !api)
  throw Error(
    "Configure TEAM_WORLD_RELAY_KEY, TEAM_WORLD_ALLOWED_ORIGIN and TEAM_WORLD_API_URL",
  );
const authority = createAuthority({
  baseURL: api,
  key,
  gatewayKey: process.env.DEV_API_GATEWAY_TOKEN,
});
const server = createServer((request, response) => {
  response.setHeader("Cache-Control", "no-store");
  response.writeHead(request.url === "/healthz" ? 200 : 404, {
    "Content-Type": "application/json",
  });
  response.end(
    JSON.stringify({ status: request.url === "/healthz" ? "ok" : "not_found" }),
  );
});
const rooms = createRoomService({
  server,
  map,
  catalog: [],
  objectBehaviors: [cannonBehavior],
  allowedOrigins: [origin],
  ...authority,
  store: {
    async load(_room, currentMap) {
      return {
        version: 1,
        mapId: currentMap.id,
        revision: 0,
        items: [],
        receipts: {},
      };
    },
    async commit() {
      throw Error("Decorating is not enabled for this world");
    },
  },
});
server.listen(
  Number(process.env.TEAM_WORLD_PORT || 8795),
  process.env.TEAM_WORLD_BIND || "127.0.0.1",
  () => console.log("Team World relay listening"),
);
let closing = false;
async function close() {
  if (closing) return;
  closing = true;
  await rooms.close();
  server.close();
}
process.on("SIGINT", () => void close());
process.on("SIGTERM", () => void close());
