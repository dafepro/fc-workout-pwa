import { playerColor } from "../avatar/color";
import type { AvatarConfiguration } from "../avatar/types";
import type { Player, TrainingDashboard } from "../domain/types";
import {
  createConnectedAvatarGateway,
  type AvatarGateway,
} from "./avatar-gateway";
import {
  createConnectedPrizeBoxGateway,
  type PrizeBoxGateway,
} from "./prize-box-gateway";
import {
  createConnectedReactionGateway,
  type ReactionGateway,
} from "./reaction-gateway";
import {
  createConnectedSocialGateway,
  type SocialGateway,
} from "./social-gateway";
import {
  createConnectedTeamHubGateway,
  type TeamHubGateway,
} from "./team-hub-gateway";
import {
  createConnectedTrainingDashboardGateway,
  type TrainingDashboardGateway,
} from "./training-dashboard-gateway";
import {
  createConnectedTrainingEntryGateway,
  type TrainingEntryGateway,
} from "./training-entry-gateway";

export interface SessionProfile {
  accountId: string;
  role: string;
  player: {
    id: string;
    firstName: string;
    lastInitial: string;
    teams: { id: string; name: string; timeZone: string }[];
    avatarConfiguration?: AvatarConfiguration;
  };
}

export interface TeamHubRuntimeInput {
  currentPlayerID: string;
  dashboard: TrainingDashboard | null;
}

export interface PlayerRuntimeAdapter {
  mode: "connected" | "unhosted-prototype";
  session: SessionProfile | null;
  currentPlayerID: string;
  currentPlayer: Player;
  currentTeam: { id: string; name: string; timeZone: string };
  avatar: AvatarGateway;
  trainingEntries: TrainingEntryGateway;
  trainingDashboard: TrainingDashboardGateway;
  reactions: ReactionGateway;
  prizeBoxes: PrizeBoxGateway;
  social(): SocialGateway;
  teamHub(input: TeamHubRuntimeInput): TeamHubGateway;
}

export function parseConnectedSession(value: unknown): SessionProfile | null {
  if (!isRecord(value) || !isNonemptyString(value.accountId)) return null;
  if (!isNonemptyString(value.role) || !isRecord(value.player)) return null;
  const player = value.player;
  if (
    !isNonemptyString(player.id) ||
    !isNonemptyString(player.firstName) ||
    !isNonemptyString(player.lastInitial) ||
    !Array.isArray(player.teams) ||
    player.teams.length === 0
  ) {
    return null;
  }
  const teams = player.teams.filter(
    (team): team is { id: string; name: string; timeZone: string } =>
      isRecord(team) &&
      isNonemptyString(team.id) &&
      isNonemptyString(team.name) &&
      isNonemptyString(team.timeZone),
  );
  if (teams.length !== player.teams.length) return null;
  const avatarConfiguration = isRecord(player.avatarConfiguration)
    ? (player.avatarConfiguration as AvatarConfiguration)
    : undefined;
  return {
    accountId: value.accountId,
    role: value.role,
    player: {
      id: player.id,
      firstName: player.firstName,
      lastInitial: player.lastInitial,
      teams,
      avatarConfiguration,
    },
  };
}

export function createConnectedPlayerRuntime(
  session: SessionProfile,
): PlayerRuntimeAdapter {
  const currentPlayerID = session.player.id;
  const currentTeam = session.player.teams[0];
  const currentPlayer: Player = {
    id: currentPlayerID,
    firstName: session.player.firstName,
    lastInitial: `${session.player.lastInitial.replace(/\.$/u, "")}.`,
    initials:
      `${session.player.firstName[0] ?? ""}${session.player.lastInitial[0] ?? ""}`.toUpperCase(),
    avatarColor: playerColor(currentPlayerID),
    weeklySessions: 0,
    effortPoints: 0,
    currentStreak: 0,
    consistency: 0,
  };
  return {
    mode: "connected",
    session,
    currentPlayerID,
    currentPlayer,
    currentTeam,
    avatar: createConnectedAvatarGateway(
      session.player.avatarConfiguration ?? {},
    ),
    trainingEntries: createConnectedTrainingEntryGateway(currentTeam.id),
    trainingDashboard: createConnectedTrainingDashboardGateway(currentTeam.id),
    reactions: createConnectedReactionGateway(),
    prizeBoxes: createConnectedPrizeBoxGateway(),
    social: () => createConnectedSocialGateway(currentTeam.id),
    teamHub: () => createConnectedTeamHubGateway(currentTeam.id),
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isNonemptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}
