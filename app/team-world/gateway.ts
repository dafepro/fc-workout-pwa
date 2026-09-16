import { worldCopy } from "./copy";
export type WorldTicket = {
  ticket: string;
  teamId: string;
  roomId: string;
  relayUrl: string;
  expiresInSeconds: number;
};
export function parseWorldTicket(value: unknown, teamID: string): WorldTicket {
  if (!value || typeof value !== "object") throw Error(worldCopy.unavailable);
  const v = value as Record<string, unknown>;
  if (
    typeof v.ticket !== "string" ||
    !/^[A-Za-z0-9_-]{43}$/.test(v.ticket) ||
    v.teamId !== teamID ||
    typeof v.roomId !== "string" ||
    !/^world-v3-[a-f0-9]{64}$/.test(v.roomId) ||
    typeof v.relayUrl !== "string" ||
    !Number.isInteger(v.expiresInSeconds) ||
    (v.expiresInSeconds as number) < 1 ||
    (v.expiresInSeconds as number) > 30
  )
    throw Error(worldCopy.unavailable);
  const url = new URL(v.relayUrl);
  const local = ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname);
  if (
    (url.protocol !== "wss:" && !(url.protocol === "ws:" && local)) ||
    url.username ||
    url.password ||
    url.search ||
    url.hash ||
    url.pathname !== "/room"
  )
    throw Error(worldCopy.unavailable);
  return {
    ticket: v.ticket,
    teamId: teamID,
    roomId: v.roomId,
    relayUrl: url.href,
    expiresInSeconds: v.expiresInSeconds as number,
  };
}
export async function requestWorldTicket(teamID: string, signal?: AbortSignal) {
  if (!/^[A-Za-z0-9_-]{1,128}$/.test(teamID))
    throw Error(worldCopy.unavailable);
  const response = await fetch(
    `/api/zoomigo/v1/teams/${encodeURIComponent(teamID)}/world/ticket`,
    { method: "POST", signal, cache: "no-store" },
  );
  if (!response.ok)
    throw Error(
      response.status === 423 ? worldCopy.locked : worldCopy.unavailable,
    );
  return parseWorldTicket(await response.json(), teamID);
}
