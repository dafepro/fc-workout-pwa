import type {
  ReactionContext,
  TeamHubActivity,
  TeamHubProjection,
  TeamPulseActivity,
  TrainingDashboard,
} from "../domain/types";
import type { TeamHubGateway } from "../data/team-hub-gateway";
import { playerFromSocialIdentity } from "../data/social-identity";
import { createUnhostedPrototypeSocialGateway } from "./social-gateway";

export interface UnhostedPrototypeTeamHubInput {
  currentPlayerID: string;
  dashboard: TrainingDashboard | null;
}

export function createUnhostedPrototypeTeamHubGateway(
  teamID: string,
  input: UnhostedPrototypeTeamHubInput,
): TeamHubGateway {
  return new UnhostedPrototypeTeamHubGateway(teamID, input);
}

class UnhostedPrototypeTeamHubGateway implements TeamHubGateway {
  constructor(
    private readonly teamID: string,
    private readonly input: UnhostedPrototypeTeamHubInput,
  ) {}

  async current(): Promise<TeamHubProjection> {
    const projection =
      await createUnhostedPrototypeSocialGateway().teamActivity();
    const dashboard = this.input.dashboard;
    const unlocked = dashboard?.teamPulse.unlocked ?? false;
    const challenge = projection.currentChallenge;
    const members = new Map(
      projection.members.map((member) => [member.id, member]),
    );
    const activity = unlocked
      ? (dashboard?.teamPulse.recentActivities ?? [])
          .filter((item) => item.playerId !== this.input.currentPlayerID)
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
