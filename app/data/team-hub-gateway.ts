import type {
  ReactionContext,
  TeamHubActivity,
  TeamHubProjection,
  TeamPulseActivity,
  TrainingDashboard,
} from "../domain/types";
import { createSocialGateway } from "./social-gateway";
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

export interface LocalTeamHubInput {
  currentPlayerID: string;
  dashboard: TrainingDashboard | null;
}

class HTTPTeamHubGateway implements TeamHubGateway {
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

class LocalTeamHubGateway implements TeamHubGateway {
  constructor(
    private readonly teamID: string,
    private readonly input?: LocalTeamHubInput,
  ) {}

  async current(): Promise<TeamHubProjection> {
    const projection = await createSocialGateway(
      false,
      this.teamID,
    ).teamActivity();
    const dashboard = this.input?.dashboard;
    const unlocked = dashboard?.teamPulse.unlocked ?? false;
    const challenge = projection.currentChallenge;
    const members = new Map(
      projection.members.map((member) => [member.id, member]),
    );
    const activity = unlocked
      ? (dashboard?.teamPulse.recentActivities ?? [])
          .filter((item) => item.playerId !== this.input?.currentPlayerID)
          .slice(0, 5)
          .map((item) =>
            localActivity(
              item,
              members.get(item.playerId),
              challenge?.id,
              this.teamID,
            ),
          )
      : [];
    return {
      team: {
        id: projection.team.id,
        name: projection.team.name,
        weekStart: projection.weekStart,
        weekEnd: projection.weekEnd,
      },
      access: { activityUnlocked: unlocked, loungeUnlocked: unlocked },
      focus: challenge
        ? [
            {
              kind: "challenge",
              id: challenge.id,
              title: challenge.activityName,
              current: challenge.completedCount,
              target: projection.members.length,
              unit: "teammates",
              dueOn: challenge.dueOn,
            },
          ]
        : [],
      activitySummary: {
        activeThisWeek: dashboard?.teamPulse.activeThisWeek ?? 0,
      },
      activity,
      lounge: { themeId: "beach-boardwalk", title: "Team Lounge" },
    };
  }
}

export function createTeamHubGateway(
  connected: boolean,
  teamID: string,
  localInput?: LocalTeamHubInput,
): TeamHubGateway {
  return connected
    ? new HTTPTeamHubGateway(teamID)
    : new LocalTeamHubGateway(teamID, localInput);
}

function localActivity(
  item: TeamPulseActivity,
  member: { challengeCompleted: boolean; goalStatus: string } | undefined,
  assignmentID: string | undefined,
  teamID: string,
): TeamHubActivity {
  const signals: TeamHubActivity["signals"] = [
    { kind: item.recency === "Today" ? "active_today" : "active_this_week" },
  ];
  let reactionContext: ReactionContext = {
    type: "team_progress",
    teamId: teamID,
    period: "weekly",
  };
  if (member?.challengeCompleted && assignmentID) {
    signals.push({ kind: "challenge_complete" });
    reactionContext = {
      type: "challenge",
      teamId: teamID,
      assignmentId: assignmentID,
    };
  }
  if (member?.goalStatus === "completed") {
    signals.push({ kind: "weekly_goal_complete" });
  }
  return {
    player: playerFromSocialIdentity({
      id: item.playerId,
      firstName: item.firstName,
      lastInitial: item.lastInitial,
    }),
    signals,
    reactionContext,
  };
}
