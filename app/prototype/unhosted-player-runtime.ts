import type { PlayerRuntimeAdapter } from "../data/player-runtime";
import { createUnhostedPrototypeAvatarGateway } from "./avatar-gateway";
import { CURRENT_PLAYER_ID, players, TEAM_NAME } from "./data";
import { createUnhostedPrototypePrizeBoxGateway } from "./prize-box-gateway";
import { createUnhostedPrototypeReactionGateway } from "./reaction-gateway";
import { createUnhostedPrototypeSocialGateway } from "./social-gateway";
import { createUnhostedPrototypeTeamHubGateway } from "./team-hub-gateway";
import { createUnhostedPrototypeTrainingDashboardGateway } from "./training-dashboard-gateway";
import { createUnhostedPrototypeTrainingEntryGateway } from "./training-entry-gateway";

export function createUnhostedPrototypeRuntime(): PlayerRuntimeAdapter {
  const currentPlayer = players.find(
    (player) => player.id === CURRENT_PLAYER_ID,
  );
  if (!currentPlayer) throw new Error("Unhosted prototype player is missing.");
  const currentTeam = {
    id: "team-hill-striders",
    name: TEAM_NAME,
    timeZone: "America/Chicago",
  };
  return {
    mode: "unhosted-prototype",
    session: null,
    currentPlayerID: CURRENT_PLAYER_ID,
    currentPlayer,
    currentTeam,
    avatar: createUnhostedPrototypeAvatarGateway(),
    trainingEntries: createUnhostedPrototypeTrainingEntryGateway(),
    trainingDashboard: createUnhostedPrototypeTrainingDashboardGateway(),
    reactions: createUnhostedPrototypeReactionGateway(),
    prizeBoxes: createUnhostedPrototypePrizeBoxGateway(),
    social: createUnhostedPrototypeSocialGateway,
    teamHub: (input) =>
      createUnhostedPrototypeTeamHubGateway(currentTeam.id, input),
  };
}
