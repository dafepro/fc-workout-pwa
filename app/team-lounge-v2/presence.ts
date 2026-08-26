import type { AvatarConfiguration } from "../avatar/types";

export interface LoungeRosterMember {
  playerID: string;
  displayName: string;
  avatarConfiguration: AvatarConfiguration;
}

export interface LoungePresenceParticipant {
  participantId: string;
  avatarEntityId: string;
  status: "active" | "inactive" | "disconnected";
}

export interface LoungeAvatarProjection {
  entityId: string;
  screen: Readonly<{ x: number; y: number }>;
  visible: boolean;
  inViewport: boolean;
}

export interface LoungeParticipantOverlay {
  playerID: string;
  displayName: string;
  accessibleName: string;
  current: boolean;
  avatarConfiguration: AvatarConfiguration;
  screen: Readonly<{ x: number; y: number }>;
}

export function mergeLoungePresence({
  currentPlayerID,
  roster,
  participants,
  projections,
}: {
  currentPlayerID: string;
  roster: readonly LoungeRosterMember[];
  participants: readonly LoungePresenceParticipant[];
  projections: readonly LoungeAvatarProjection[];
}): LoungeParticipantOverlay[] {
  const rosterByPlayer = new Map(
    roster.map((member) => [member.playerID, member]),
  );
  const projectionByEntity = new Map(
    projections.map((projection) => [projection.entityId, projection]),
  );

  return participants.flatMap((participant) => {
    const member = rosterByPlayer.get(participant.participantId);
    const projection = projectionByEntity.get(participant.avatarEntityId);
    if (
      !member ||
      participant.status !== "active" ||
      !projection?.visible ||
      !projection.inViewport
    ) {
      return [];
    }
    const current = participant.participantId === currentPlayerID;
    return [
      {
        playerID: participant.participantId,
        displayName: current ? "You" : member.displayName,
        accessibleName: current
          ? `${member.displayName}, you`
          : member.displayName,
        current,
        avatarConfiguration: member.avatarConfiguration,
        screen: projection.screen,
      },
    ];
  });
}
