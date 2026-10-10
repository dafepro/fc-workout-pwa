import {
  backendBaseURL,
  backendHeaders,
  forwardedHeaders,
  jsonError,
  limitedBody,
  readSessionCookie,
  sameOrigin,
} from "../../backend";
import type { AnalyticsSession } from "../../../../lib/analytics/identity";

export async function POST(request: Request) {
  if (!sameOrigin(request))
    return jsonError(403, "forbidden_origin", "The request was not allowed.");
  const token = readSessionCookie(request);
  if (!token) return jsonError(401, "unauthenticated", "Sign in is required.");
  const base = backendBaseURL();
  if (!base)
    return jsonError(
      503,
      "backend_unavailable",
      "Team selection is unavailable.",
    );
  let teamID: string;
  try {
    const value = JSON.parse(await limitedBody(request, 1024));
    if (
      !value ||
      typeof value !== "object" ||
      Array.isArray(value) ||
      Object.keys(value).length !== 1 ||
      typeof value.teamId !== "string" ||
      !/^[A-Za-z0-9_-]{1,128}$/.test(value.teamId)
    )
      throw Error("Invalid request");
    teamID = value.teamId;
  } catch {
    return jsonError(400, "invalid_request", "Choose a current team.");
  }
  try {
    const upstream = await fetch(`${base}/v1/auth/session`, {
      headers: backendHeaders({ Authorization: `Bearer ${token}` }),
    });
    if (!upstream.ok)
      return new Response(await upstream.text(), {
        status: upstream.status,
        headers: forwardedHeaders(upstream),
      });
    const session = (await upstream.json()) as AnalyticsSession;
    if (!session.player?.teams.some((team) => team.id === teamID))
      return jsonError(403, "forbidden", "Choose a current team.");
    return Response.json(
      { playerId: session.player.id, activeTeamId: teamID },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch {
    return jsonError(
      503,
      "backend_unavailable",
      "Team selection is unavailable.",
    );
  }
}
