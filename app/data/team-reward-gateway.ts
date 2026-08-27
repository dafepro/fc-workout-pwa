import type { TeamRewardProjection } from "../domain/types";

export interface TeamRewardGateway {
  current(): Promise<TeamRewardProjection | null>;
}

export class TeamRewardGatewayError extends Error {
  constructor(
    public readonly code: string,
    message: string,
  ) {
    super(message);
  }
}

class HTTPTeamRewardGateway implements TeamRewardGateway {
  constructor(private readonly teamID: string) {}

  async current(): Promise<TeamRewardProjection | null> {
    const response = await fetch(
      `/api/zoomigo/v1/teams/${encodeURIComponent(this.teamID)}/team-reward`,
      { cache: "no-store" },
    );
    if (response.ok) return (await response.json()) as TeamRewardProjection;
    if (response.status === 404) return null;

    let code = "team_reward_failed";
    let message = "Team reward progress could not be loaded.";
    try {
      const body = (await response.json()) as {
        error?: { code?: string; message?: string };
      };
      code = body.error?.code ?? code;
      message = body.error?.message ?? message;
    } catch {
      // An intermediary may return non-JSON; the predefined fallback stays safe.
    }
    throw new TeamRewardGatewayError(code, message);
  }
}

class LocalTeamRewardGateway implements TeamRewardGateway {
  async current(): Promise<null> {
    return null;
  }
}

export function createTeamRewardGateway(
  connected: boolean,
  teamID: string,
): TeamRewardGateway {
  return connected
    ? new HTTPTeamRewardGateway(teamID)
    : new LocalTeamRewardGateway();
}
