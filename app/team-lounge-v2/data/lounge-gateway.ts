export interface LoungeTheme {
  id: "beach-boardwalk";
  version: 1;
  name: "Beach Boardwalk";
}

export interface TeamLoungeCredential {
  ticket: string;
  roomID: string;
  serverURL: string;
  visitorIDs: string[];
  placementCredits: number;
  placementDay: string;
  theme: LoungeTheme;
}

export interface PreparedTeamLoungeJoin {
  roomID: string;
  serverURL: string;
  visitorIDs: string[];
  placementCredits: number;
  placementDay: string;
  theme: LoungeTheme;
  credentialProvider(): Promise<string>;
}

export async function prepareTeamLoungeJoin(
  teamID: string,
): Promise<PreparedTeamLoungeJoin> {
  let queued: TeamLoungeCredential | null =
    await requestTeamLoungeCredential(teamID);
  const roomID = queued.roomID;
  const serverURL = queued.serverURL;
  const queuedTheme = queued.theme;
  return {
    roomID,
    serverURL,
    visitorIDs: [...queued.visitorIDs],
    placementCredits: queued.placementCredits,
    placementDay: queued.placementDay,
    theme: queuedTheme,
    async credentialProvider() {
      const credential = queued ?? (await requestTeamLoungeCredential(teamID));
      queued = null;
      if (
        credential.roomID !== roomID ||
        credential.serverURL !== serverURL ||
        credential.theme.id !== queuedTheme.id ||
        credential.theme.version !== queuedTheme.version
      ) {
        throw new Error("The team lounge changed during reconnect.");
      }
      return `ticket.${credential.ticket}`;
    },
  };
}

export async function requestTeamLoungeCredential(
  teamID: string,
): Promise<TeamLoungeCredential> {
  if (!/^[a-zA-Z0-9_-]{1,128}$/u.test(teamID)) {
    throw new Error("The team lounge is unavailable.");
  }
  const response = await fetch(
    `/api/zoomigo/v1/teams/${encodeURIComponent(teamID)}/lounge-v2/socket-ticket`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "{}",
      cache: "no-store",
    },
  );
  if (!response.ok) {
    throw new Error("The team lounge is unavailable.");
  }
  const body = (await response.json()) as Record<string, unknown>;
  const ticket = typeof body.ticket === "string" ? body.ticket : "";
  const roomID = typeof body.roomId === "string" ? body.roomId : "";
  const serverURL = typeof body.serverUrl === "string" ? body.serverUrl : "";
  const visitorIDs = Array.isArray(body.visitorIds) ? body.visitorIds : [];
  const placementCredits = body.placementCredits;
  const placementDay =
    typeof body.placementDay === "string" ? body.placementDay : "";
  const theme = loungeTheme(body.theme);
  let parsedServer: URL;
  try {
    parsedServer = new URL(serverURL);
  } catch {
    throw new Error("The team lounge is unavailable.");
  }
  if (
    !/^[a-zA-Z0-9_-]{43}$/u.test(ticket) ||
    !roomID.startsWith(`team:${teamID}:lounge:`) ||
    !["https:", "http:"].includes(parsedServer.protocol) ||
    visitorIDs.length > 3 ||
    visitorIDs.some(
      (playerID) =>
        typeof playerID !== "string" ||
        !/^[a-zA-Z0-9_-]{1,128}$/u.test(playerID),
    ) ||
    new Set(visitorIDs).size !== visitorIDs.length ||
    !Number.isInteger(placementCredits) ||
    (placementCredits as number) < 0 ||
    (placementCredits as number) > 7 ||
    !/^\d{4}-\d{2}-\d{2}$/u.test(placementDay) ||
    !theme
  ) {
    throw new Error("The team lounge is unavailable.");
  }
  return {
    ticket,
    roomID,
    serverURL: parsedServer.toString().replace(/\/$/u, ""),
    visitorIDs: [...visitorIDs] as string[],
    placementCredits: placementCredits as number,
    placementDay,
    theme,
  };
}

function loungeTheme(value: unknown): LoungeTheme | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const theme = value as Record<string, unknown>;
  return theme.id === "beach-boardwalk" &&
    theme.version === 1 &&
    theme.name === "Beach Boardwalk"
    ? { id: "beach-boardwalk", version: 1, name: "Beach Boardwalk" }
    : null;
}
