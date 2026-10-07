import type { AnalyticsIdentity } from "./storage";
import { selectTeam } from "../team-context";

export interface AnalyticsSession {
  activeTeamId?: string;
  player: {
    id: string;
    teams: { id: string; name: string; timeZone?: string }[];
  } | null;
}

export async function pseudonymize(
  rawIdentifier: string,
  secret: string,
): Promise<string> {
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const digest = await crypto.subtle.sign(
    "HMAC",
    key,
    encoder.encode(rawIdentifier),
  );
  return Array.from(new Uint8Array(digest), (byte) =>
    byte.toString(16).padStart(2, "0"),
  ).join("");
}

export async function identityForSession(
  session: AnalyticsSession,
  secret: string,
): Promise<AnalyticsIdentity | null> {
  if (!session.player) return null;
  if (
    session.activeTeamId &&
    !session.player.teams.some((team) => team.id === session.activeTeamId)
  )
    return null;
  const team = selectTeam(session.player.teams, session.activeTeamId);
  return {
    subjectKey: await pseudonymize(`player:${session.player.id}`, secret),
    teamKey: team ? await pseudonymize(`team:${team.id}`, secret) : null,
    timeZone: team?.timeZone || "UTC",
  };
}
