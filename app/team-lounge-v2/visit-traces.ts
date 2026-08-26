import type { AvatarConfiguration } from "../avatar/types";
import type { LoungeRosterMember } from "./presence";

export interface LoungeVisitTraceOverlay {
  playerID: string;
  displayName: string;
  accessibleName: string;
  avatarConfiguration: AvatarConfiguration;
  screen: Readonly<{ x: number; y: number }>;
}

export function mergeLoungeVisitTraces({
  currentPlayerID,
  visitorIDs,
  activePlayerIDs,
  roster,
  anchors,
}: {
  currentPlayerID: string;
  visitorIDs: readonly string[];
  activePlayerIDs: readonly string[];
  roster: readonly LoungeRosterMember[];
  anchors: readonly Readonly<{ x: number; y: number }>[];
}): LoungeVisitTraceOverlay[] {
  const active = new Set(activePlayerIDs);
  const rosterByPlayer = new Map(
    roster.map((member) => [member.playerID, member]),
  );
  return visitorIDs
    .filter((playerID) => playerID !== currentPlayerID && !active.has(playerID))
    .flatMap((playerID) => {
      const member = rosterByPlayer.get(playerID);
      return member ? [member] : [];
    })
    .slice(0, anchors.length)
    .map((member, index) => ({
      playerID: member.playerID,
      displayName: member.displayName,
      accessibleName: `${member.displayName} stopped by this week`,
      avatarConfiguration: member.avatarConfiguration,
      screen: anchors[index]!,
    }));
}
