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
  state: "current" | "active" | "bench";
}

export function resolveLoungeAvatarOverlays({
  currentPlayer,
  roster,
  participants,
  projections,
  currentAvatarProjection,
  benchProjections = [],
}: {
  currentPlayer: Player;
  roster: readonly Player[];
  participants: readonly LoungePresenceParticipant[];
  projections: readonly LoungeAvatarProjection[];
  currentAvatarProjection?: Pick<
    LoungeAvatarProjection,
    "screen" | "inViewport"
  >;
  benchProjections?: readonly Pick<
    LoungeAvatarProjection,
    "screen" | "inViewport"
  >[];
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
      state: "current",
    });
  }

  const activePlayerIDs = new Set<string>();
  for (const participant of participants) {
    if (
      participant.userId === currentPlayer.id ||
      participant.status !== "active"
    ) {
      continue;
    }
    const player = roster.find(({ id }) => id === participant.userId);
    const projection = projectionByEntity.get(participant.avatarEntityId);
    if (!player || !projection?.inViewport) continue;
    activePlayerIDs.add(player.id);
    overlays.push({
      player,
      position: projection.screen,
      current: false,
      state: "active",
    });
  }

  const benchPlayers = roster.filter(
    (player) =>
      player.id !== currentPlayer.id &&
      !activePlayerIDs.has(player.id) &&
      completedWork(player),
  );
  benchPlayers.forEach((player, index) => {
    const projection = benchProjections[index];
    if (!projection?.inViewport) return;
    overlays.push({
      player,
      position: projection.screen,
      current: false,
      state: "bench",
    });
  });

  return overlays;
}

function completedWork(player: Player): boolean {
  const progress = player as Player & {
    goalStatus?: "completed" | "one_away" | "keep_going";
    challengeCompleted?: boolean;
  };
  return (
    progress.goalStatus === "completed" || progress.challengeCompleted === true
  );
}
