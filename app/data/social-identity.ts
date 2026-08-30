import { playerColor } from "../avatar/color";
import type { Player } from "../domain/types";

export function playerFromSocialIdentity(identity: {
  id: string;
  firstName: string;
  lastInitial: string;
}): Player {
  const lastInitial = `${identity.lastInitial.replace(/\.$/, "")}.`;
  return {
    id: identity.id,
    firstName: identity.firstName,
    lastInitial,
    initials:
      `${identity.firstName[0] ?? ""}${lastInitial[0] ?? ""}`.toUpperCase(),
    avatarColor: playerColor(identity.id),
    weeklySessions: 0,
    effortPoints: 0,
    currentStreak: 0,
    consistency: 0,
  };
}
