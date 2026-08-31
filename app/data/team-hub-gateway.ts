import type { TeamHubActivity, TeamHubProjection } from "../domain/types";
import { playerFromSocialIdentity } from "./social-identity";

export interface TeamHubGateway {
  current(): Promise<TeamHubProjection>;
}

export class TeamHubGatewayError extends Error {
  constructor(
    public readonly code: string,
    message: string,
  ) {
    super(message);
  }
}

interface APITeamHub extends Omit<TeamHubProjection, "activity"> {
  activity: Array<
    Omit<TeamHubActivity, "player"> & {
      player: { id: string; firstName: string; lastInitial: string };
    }
  >;
}

class ConnectedTeamHubGateway implements TeamHubGateway {
  constructor(private readonly teamID: string) {}

  async current(): Promise<TeamHubProjection> {
    const response = await fetch(
      `/api/zoomigo/v1/teams/${encodeURIComponent(this.teamID)}/hub`,
      { cache: "no-store" },
    );
    if (!response.ok) {
      let code = "team_hub_failed";
      let message = "Your Team Hub could not be loaded.";
      try {
        const body = (await response.json()) as {
          error?: { code?: string; message?: string };
        };
        code = body.error?.code ?? code;
        message = body.error?.message ?? message;
      } catch {
        // Keep reviewed copy when an intermediary does not return JSON.
      }
      throw new TeamHubGatewayError(code, message);
    }
    const hub = (await response.json()) as APITeamHub;
    return {
      ...hub,
      focus: hub.focus.map((item) => ({
        ...item,
        imageUrl: item.mediaId
          ? `/api/zoomigo/v1/teams/${encodeURIComponent(this.teamID)}/reward-media/${encodeURIComponent(item.mediaId)}`
          : undefined,
      })),
      activity: hub.activity.map((row) => ({
        ...row,
        player: playerFromSocialIdentity(row.player),
      })),
    };
  }
}

export function createConnectedTeamHubGateway(teamID: string): TeamHubGateway {
  return new ConnectedTeamHubGateway(teamID);
}
