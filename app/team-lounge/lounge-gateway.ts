export interface TeamLoungeCredential {
  ticket: string;
  roomID: string;
  serverURL: string;
  visitorIDs: string[];
  placementCredits: number;
}

export async function requestTeamLoungeCredential(
  teamID: string,
): Promise<TeamLoungeCredential> {
  if (!/^[a-zA-Z0-9_-]{1,128}$/u.test(teamID)) {
    throw new Error("The Team Lounge is unavailable.");
  }
  const response = await fetch(
    `/api/zoomigo/v1/teams/${encodeURIComponent(teamID)}/lounge/socket-ticket`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "{}",
      cache: "no-store",
    },
  );
  if (!response.ok) throw new Error("The Team Lounge is unavailable.");
  const body = (await response.json()) as Record<string, unknown>;
  const ticket = typeof body.ticket === "string" ? body.ticket : "";
  const roomID = typeof body.roomId === "string" ? body.roomId : "";
  const serverURL = typeof body.serverUrl === "string" ? body.serverUrl : "";
  const visitorIDs = Array.isArray(body.visitorIds) ? body.visitorIds : [];
  const placementCredits = body.placementCredits;
  let parsedServer: URL;
  try {
    parsedServer = new URL(serverURL);
  } catch {
    throw new Error("The Team Lounge is unavailable.");
  }
  if (
    !/^[a-zA-Z0-9_-]{43}$/u.test(ticket) ||
    !roomID.startsWith(`team:${teamID}:lounge:`) ||
    !["http:", "https:"].includes(parsedServer.protocol) ||
    visitorIDs.length > 3 ||
    visitorIDs.some(
      (playerID) =>
        typeof playerID !== "string" ||
        !/^[a-zA-Z0-9_-]{1,128}$/u.test(playerID),
    ) ||
    !Number.isInteger(placementCredits) ||
    (placementCredits as number) < 0 ||
    (placementCredits as number) > 99
  ) {
    throw new Error("The Team Lounge is unavailable.");
  }
  return {
    ticket,
    roomID,
    serverURL: parsedServer.toString().replace(/\/$/u, ""),
    visitorIDs: visitorIDs as string[],
    placementCredits: placementCredits as number,
  };
}

export async function prepareTeamLoungeJoin(teamID: string) {
  let queued: TeamLoungeCredential | null =
    await requestTeamLoungeCredential(teamID);
  const roomID = queued.roomID;
  const serverURL = queued.serverURL;
  return {
    roomID,
    serverURL,
    visitorIDs: queued.visitorIDs,
    placementCredits: queued.placementCredits,
    async credentialProvider() {
      const credential = queued ?? (await requestTeamLoungeCredential(teamID));
      queued = null;
      if (credential.roomID !== roomID || credential.serverURL !== serverURL) {
        throw new Error("The Team Lounge changed during reconnect.");
      }
      return `ticket.${credential.ticket}`;
    },
  };
}

export async function reserveTeamLoungePlacement(
  teamID: string,
  roomID: string,
  definitionID: string,
  position: { x: number; y: number },
  idempotencyKey: string,
): Promise<{ placementID: string; remaining: number }> {
  const response = await fetch(
    `/api/zoomigo/v1/teams/${encodeURIComponent(teamID)}/lounge/placements`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Idempotency-Key": idempotencyKey,
      },
      body: JSON.stringify({
        roomId: roomID,
        definitionId: definitionID,
        position,
      }),
    },
  );
  if (!response.ok) throw await placementError(response);
  const body = (await response.json()) as Record<string, unknown>;
  const placementID = body.placementId;
  const remaining = body.remainingPlacements;
  if (
    typeof placementID !== "string" ||
    !/^lounge-placement-[a-f0-9]{32}$/u.test(placementID) ||
    !Number.isInteger(remaining) ||
    (remaining as number) < 0
  ) {
    throw new Error("That Lounge item could not be placed.");
  }
  return { placementID, remaining: remaining as number };
}

export async function commitTeamLoungePlacement(
  teamID: string,
  roomID: string,
  placementID: string,
  entityID: string,
): Promise<void> {
  const response = await fetch(
    `/api/zoomigo/v1/teams/${encodeURIComponent(teamID)}/lounge/placements/${encodeURIComponent(placementID)}/commit`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ roomId: roomID, entityId: entityID }),
    },
  );
  if (!response.ok) throw await placementError(response);
}

async function placementError(response: Response): Promise<Error> {
  let message = "That Lounge item could not be placed.";
  try {
    const body = (await response.json()) as {
      error?: { message?: string };
    };
    message = body.error?.message ?? message;
  } catch {
    // The fixed fallback is safe when an intermediary returns a non-JSON error.
  }
  return new Error(message);
}
