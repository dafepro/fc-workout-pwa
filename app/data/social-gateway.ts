import type {
  TeamActivityProjection,
  TeamGoalStatus,
  TeamMemberProjection,
} from "../domain/types";
import { playerFromSocialIdentity } from "./social-identity";

export interface SocialGateway {
  teamActivity(): Promise<TeamActivityProjection>;
}

export class SocialGatewayError extends Error {
  constructor(
    public readonly code: string,
    message: string,
  ) {
    super(message);
  }
}

interface APITeamMember {
  playerId: string;
  firstName: string;
  lastInitial: string;
  weeklySessions: number;
  effortPoints: number;
  currentStreak: number;
  consistencyDays: number;
  goalStatus: TeamGoalStatus;
  challengeCompleted: boolean;
}

interface APITeamActivity extends Omit<TeamActivityProjection, "members"> {
  members: APITeamMember[];
}

class ConnectedSocialGateway implements SocialGateway {
  constructor(private readonly teamID: string) {}

  async teamActivity(): Promise<TeamActivityProjection> {
    const response = await this.request(
      `/v1/teams/${encodeURIComponent(this.teamID)}/activity`,
    );
    const body = (await response.json()) as APITeamActivity;
    return { ...body, members: body.members.map(fromAPITeamMember) };
  }

  private async request(path: string): Promise<Response> {
    const response = await fetch(`/api/zoomigo${path}`, { cache: "no-store" });
    if (response.ok) return response;
    let code = "social_projection_failed";
    let message = "Team progress could not be loaded.";
    try {
      const body = (await response.json()) as {
        error?: { code?: string; message?: string };
      };
      code = body.error?.code ?? code;
      message = body.error?.message ?? message;
    } catch {
      // An intermediary may return a non-JSON error; keep predefined copy.
    }
    throw new SocialGatewayError(code, message);
  }
}

export function createConnectedSocialGateway(teamID: string): SocialGateway {
  return new ConnectedSocialGateway(teamID);
}

function fromAPITeamMember(member: APITeamMember): TeamMemberProjection {
  return {
    ...playerFromSocialIdentity({ id: member.playerId, ...member }),
    weeklySessions: member.weeklySessions,
    effortPoints: member.effortPoints,
    currentStreak: member.currentStreak,
    consistency: member.consistencyDays,
    consistencyDays: member.consistencyDays,
    goalStatus: member.goalStatus,
    challengeCompleted: member.challengeCompleted,
  };
}
