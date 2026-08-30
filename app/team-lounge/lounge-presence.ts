import type { Player } from "../domain/types";

interface LoungePresenceParticipant {
  readonly userId: string;
  readonly avatarEntityId: string;
  readonly status: "active" | "inactive" | "disconnected";
}

interface LoungeAvatarProjection {
  readonly entityId: string;
  readonly screen: Readonly<{ x: number; y: number }>;
  readonly inViewport: boolean;
}

export interface LoungeAvatarOverlay {
  player: Player;
  position: Readonly<{ x: number; y: number }>;
  current: boolean;
}

export function resolveLoungeAvatarOverlays({
  currentPlayer,
  roster,
  participants,
  projections,
  currentAvatarProjection,
}: {
  currentPlayer: Player;
  roster: readonly Player[];
  participants: readonly LoungePresenceParticipant[];
  projections: readonly LoungeAvatarProjection[];
  currentAvatarProjection?: Pick<
    LoungeAvatarProjection,
    "screen" | "inViewport"
  >;
}): LoungeAvatarOverlay[] {
  const projectionByEntity = new Map(
    projections.map((projection) => [projection.entityId, projection]),
  );
  const stableCurrentProjection =
    currentAvatarProjection ??
    projectionByEntity.get(`avatar:${currentPlayer.id}`);
  const overlays: LoungeAvatarOverlay[] = [];

  if (stableCurrentProjection?.inViewport) {
    overlays.push({
      player: currentPlayer,
      position: stableCurrentProjection.screen,
      current: true,
    });
  }

  for (const participant of participants) {
    if (
      participant.userId === currentPlayer.id ||
      participant.status === "disconnected"
    ) {
      continue;
    }
    const player = roster.find(({ id }) => id === participant.userId);
    const projection = projectionByEntity.get(participant.avatarEntityId);
    if (!player || !projection?.inViewport) continue;
    overlays.push({ player, position: projection.screen, current: false });
  }

  return overlays;
}
