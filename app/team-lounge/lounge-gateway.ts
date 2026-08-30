export interface TeamLoungeCredential {
  ticket: string;
  roomID: string;
  serverURL: string;
  visitorIDs: string[];
  placementCredits: number;
  placementCapacity: number;
  editableItemIDs: string[];
}

const pendingPlacementPrefix = "zoomigo:team-lounge:pending-placement";

function pendingPlacementStorageKey(teamID: string, playerID: string) {
  return `${pendingPlacementPrefix}:${teamID}:${playerID}`;
}

export function rememberPendingTeamLoungePlacement(
  teamID: string,
  playerID: string,
  idempotencyKey: string,
) {
  sessionStorage.setItem(
    pendingPlacementStorageKey(teamID, playerID),
    idempotencyKey,
  );
}

export function clearPendingTeamLoungePlacement(
  teamID: string,
  playerID: string,
  idempotencyKey: string,
) {
  const storageKey = pendingPlacementStorageKey(teamID, playerID);
  if (sessionStorage.getItem(storageKey) === idempotencyKey) {
    sessionStorage.removeItem(storageKey);
  }
}

export async function recoverPendingTeamLoungePlacement(
  teamID: string,
  playerID: string,
  roomID: string,
): Promise<number | null> {
  const storageKey = pendingPlacementStorageKey(teamID, playerID);
  const idempotencyKey = sessionStorage.getItem(storageKey);
  if (!idempotencyKey) return null;
  const response = await fetch(
    `/api/zoomigo/v1/teams/${encodeURIComponent(teamID)}/lounge/placements/pending`,
    {
      method: "DELETE",
      headers: {
        "Content-Type": "application/json",
        "Idempotency-Key": idempotencyKey,
      },
      body: JSON.stringify({ roomId: roomID }),
    },
  );
  if (!response.ok) throw await placementError(response);
  const body = (await response.json()) as Record<string, unknown>;
  const released = body.released;
  const remaining = body.remainingPlacements;
  if (
    typeof released !== "boolean" ||
    !Number.isInteger(remaining) ||
    (remaining as number) < 0 ||
    (remaining as number) > 99
  ) {
    throw new Error("That Lounge placement could not be recovered.");
  }
  if (sessionStorage.getItem(storageKey) === idempotencyKey) {
    sessionStorage.removeItem(storageKey);
  }
  return remaining as number;
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
  const placementCapacity = body.placementCapacity;
  const editableItemIDs = body.editableItemIds;
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
    (placementCredits as number) > 99 ||
    !Number.isInteger(placementCapacity) ||
    (placementCapacity as number) < (placementCredits as number) ||
    (placementCapacity as number) > 99 ||
    !Array.isArray(editableItemIDs) ||
    editableItemIDs.length > 99 ||
    editableItemIDs.some(
      (entityID) =>
        typeof entityID !== "string" ||
        !/^[a-zA-Z0-9_-]{1,128}$/u.test(entityID),
    )
  ) {
    throw new Error("The Team Lounge is unavailable.");
  }
  return {
    ticket,
    roomID,
    serverURL: parsedServer.toString().replace(/\/$/u, ""),
    visitorIDs: visitorIDs as string[],
    placementCredits: placementCredits as number,
    placementCapacity: placementCapacity as number,
    editableItemIDs: editableItemIDs as string[],
  };
}

export async function prepareTeamLoungeJoin(teamID: string, playerID?: string) {
  let queued: TeamLoungeCredential | null =
    await requestTeamLoungeCredential(teamID);
  if (playerID) {
    const recovered = await recoverPendingTeamLoungePlacement(
      teamID,
      playerID,
      queued.roomID,
    );
    if (recovered !== null) {
      queued = { ...queued, placementCredits: recovered };
    }
  }
  const roomID = queued.roomID;
  const serverURL = queued.serverURL;
  return {
    roomID,
    serverURL,
    visitorIDs: queued.visitorIDs,
    placementCredits: queued.placementCredits,
    placementCapacity: queued.placementCapacity,
    editableItemIDs: queued.editableItemIDs,
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
  definitionVersion: number,
  position: { x: number; y: number },
  idempotencyKey: string,
): Promise<{
  placementID: string;
  permit: string;
  definitionVersion: number;
  position: { x: number; y: number };
  remaining: number;
}> {
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
        definitionVersion,
        position,
      }),
    },
  );
  if (!response.ok) throw await placementError(response);
  const body = (await response.json()) as Record<string, unknown>;
  const placementID = body.placementId;
  const permit = body.permit;
  const reservedDefinitionVersion = body.definitionVersion;
  const x = body.x;
  const y = body.y;
  const remaining = body.remainingPlacements;
  if (
    typeof placementID !== "string" ||
    !/^lounge-placement-[a-f0-9]{32}$/u.test(placementID) ||
    typeof permit !== "string" ||
    !/^[a-zA-Z0-9_-]{43}$/u.test(permit) ||
    reservedDefinitionVersion !== definitionVersion ||
    typeof x !== "number" ||
    !Number.isFinite(x) ||
    typeof y !== "number" ||
    !Number.isFinite(y) ||
    !Number.isInteger(remaining) ||
    (remaining as number) < 0
  ) {
    throw new Error("That Lounge item could not be placed.");
  }
  return {
    placementID,
    permit,
    definitionVersion: reservedDefinitionVersion as number,
    position: { x, y },
    remaining: remaining as number,
  };
}

export type TeamLoungeItemMutationKind =
  | "transform"
  | "rotation"
  | "scale"
  | "delete";

export interface TeamLoungeItemTransform {
  x: number;
  y: number;
  rotation: number;
  scale: number;
}

export async function requestTeamLoungeItemMutationPermit(
  teamID: string,
  roomID: string,
  entityID: string,
  itemRevision: number,
  kind: TeamLoungeItemMutationKind,
  transform: TeamLoungeItemTransform | null,
  idempotencyKey: string,
): Promise<{
  mutationPermitID: string;
  permit: string;
  entityID: string;
  itemRevision: number;
  kind: TeamLoungeItemMutationKind;
  transform: TeamLoungeItemTransform | null;
}> {
  const validID = /^[a-zA-Z0-9_-]{1,128}$/u;
  if (
    !validID.test(teamID) ||
    !validID.test(entityID) ||
    !roomID.startsWith(`team:${teamID}:lounge:`) ||
    !Number.isSafeInteger(itemRevision) ||
    itemRevision < 1 ||
    !["transform", "rotation", "scale", "delete"].includes(kind) ||
    (kind === "delete" ? transform !== null : !validTransform(transform))
  ) {
    throw new Error("That Lounge item could not be changed.");
  }
  const response = await fetch(
    `/api/zoomigo/v1/teams/${encodeURIComponent(teamID)}/lounge/items/${encodeURIComponent(entityID)}/mutation-permits`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Idempotency-Key": idempotencyKey,
      },
      body: JSON.stringify({
        roomId: roomID,
        itemRevision,
        kind,
        ...(transform ? { transform } : {}),
      }),
    },
  );
  if (!response.ok) throw await placementError(response);
  const body = (await response.json()) as Record<string, unknown>;
  const mutationPermitID = body.mutationPermitId;
  const permit = body.permit;
  const returnedEntityID = body.entityId;
  const returnedRevision = body.itemRevision;
  const returnedKind = body.kind;
  const returnedTransform = body.transform ?? null;
  if (
    typeof mutationPermitID !== "string" ||
    !/^lounge-mutation-[a-f0-9]{32}$/u.test(mutationPermitID) ||
    typeof permit !== "string" ||
    !/^[a-zA-Z0-9_-]{43}$/u.test(permit) ||
    returnedEntityID !== entityID ||
    returnedRevision !== itemRevision ||
    returnedKind !== kind ||
    (kind === "delete"
      ? returnedTransform !== null
      : !validTransform(returnedTransform))
  ) {
    throw new Error("That Lounge item could not be changed.");
  }
  return {
    mutationPermitID,
    permit,
    entityID,
    itemRevision,
    kind,
    transform:
      kind === "delete"
        ? null
        : (returnedTransform as unknown as TeamLoungeItemTransform),
  };
}

function validTransform(value: unknown): value is TeamLoungeItemTransform {
  if (!value || typeof value !== "object") return false;
  const transform = value as Record<string, unknown>;
  return (
    typeof transform.x === "number" &&
    Number.isFinite(transform.x) &&
    typeof transform.y === "number" &&
    Number.isFinite(transform.y) &&
    typeof transform.rotation === "number" &&
    Number.isFinite(transform.rotation) &&
    typeof transform.scale === "number" &&
    Number.isFinite(transform.scale) &&
    transform.scale >= 0.75 &&
    transform.scale <= 1.4
  );
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
