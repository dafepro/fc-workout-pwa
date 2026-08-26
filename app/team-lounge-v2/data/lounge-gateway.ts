import { LOUNGE_STAMP_ASSET_IDS } from "../placement/catalog";

export interface LoungeTheme {
  id: "beach-boardwalk";
  version: 1;
  name: "Beach Boardwalk";
}

export interface LoungePlaceableStamp {
  assetId: (typeof LOUNGE_STAMP_ASSET_IDS)[number];
  label: string;
  source: "included" | "earned";
  unlockId?: string;
  isNew: boolean;
}

export interface TeamLoungeAccess {
  roomID: string;
  placementCredits: number;
  placementDay: string;
  placeableStamps: LoungePlaceableStamp[];
}

export interface TeamLoungeCredential extends TeamLoungeAccess {
  ticket: string;
  serverURL: string;
  visitorIDs: string[];
  theme: LoungeTheme;
}

export interface PreparedTeamLoungeJoin extends TeamLoungeAccess {
  serverURL: string;
  visitorIDs: string[];
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
    placeableStamps: [...queued.placeableStamps],
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
  const access = loungeAccess(teamID, body);
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
    !access ||
    !theme
  ) {
    throw new Error("The team lounge is unavailable.");
  }
  return {
    ticket,
    roomID: access.roomID,
    serverURL: parsedServer.toString().replace(/\/$/u, ""),
    visitorIDs: [...visitorIDs] as string[],
    placementCredits: access.placementCredits,
    placementDay: access.placementDay,
    placeableStamps: access.placeableStamps,
    theme,
  };
}

export async function requestTeamLoungeAccess(
  teamID: string,
): Promise<TeamLoungeAccess> {
  if (!/^[a-zA-Z0-9_-]{1,128}$/u.test(teamID)) {
    throw new Error("The team lounge is unavailable.");
  }
  const response = await fetch(
    `/api/zoomigo/v1/teams/${encodeURIComponent(teamID)}/lounge-v2/access`,
    { cache: "no-store" },
  );
  if (!response.ok) throw new Error("The team lounge is unavailable.");
  const body = (await response.json()) as Record<string, unknown>;
  const access = loungeAccess(teamID, body);
  if (!access) throw new Error("The team lounge is unavailable.");
  return access;
}

function loungeAccess(
  teamID: string,
  body: Record<string, unknown>,
): TeamLoungeAccess | null {
  const roomID = typeof body.roomId === "string" ? body.roomId : "";
  const placementCredits = body.placementCredits;
  const placementDay =
    typeof body.placementDay === "string" ? body.placementDay : "";
  const placeableStamps = Array.isArray(body.placeableStamps)
    ? body.placeableStamps
    : [];
  const parsedStamps = placeableStamps.flatMap((value) => {
    const stamp = loungePlaceableStamp(value);
    return stamp ? [stamp] : [];
  });
  if (
    !roomID.startsWith(`team:${teamID}:lounge:`) ||
    !Number.isInteger(placementCredits) ||
    (placementCredits as number) < 0 ||
    (placementCredits as number) > 7 ||
    !/^\d{4}-\d{2}-\d{2}$/u.test(placementDay) ||
    placeableStamps.length === 0 ||
    placeableStamps.length > LOUNGE_STAMP_ASSET_IDS.length ||
    parsedStamps.length !== placeableStamps.length ||
    new Set(parsedStamps.map(({ assetId }) => assetId)).size !==
      parsedStamps.length
  ) {
    return null;
  }
  return {
    roomID,
    placementCredits: placementCredits as number,
    placementDay,
    placeableStamps: parsedStamps,
  };
}

function loungePlaceableStamp(value: unknown): LoungePlaceableStamp | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const stamp = value as Record<string, unknown>;
  if (
    typeof stamp.assetId !== "string" ||
    !LOUNGE_STAMP_ASSET_IDS.includes(stamp.assetId as never) ||
    typeof stamp.label !== "string" ||
    stamp.label.length < 1 ||
    stamp.label.length > 64 ||
    !["included", "earned"].includes(String(stamp.source)) ||
    typeof stamp.isNew !== "boolean"
  ) {
    return null;
  }
  if (
    stamp.source === "included" &&
    (stamp.unlockId !== undefined || stamp.isNew)
  ) {
    return null;
  }
  if (
    stamp.source === "earned" &&
    (typeof stamp.unlockId !== "string" ||
      !/^[a-z0-9][a-z0-9-]{0,63}$/u.test(stamp.unlockId))
  ) {
    return null;
  }
  return {
    assetId: stamp.assetId as LoungePlaceableStamp["assetId"],
    label: stamp.label,
    source: stamp.source as LoungePlaceableStamp["source"],
    ...(typeof stamp.unlockId === "string" ? { unlockId: stamp.unlockId } : {}),
    isNew: stamp.isNew,
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
