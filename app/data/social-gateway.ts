import { playerColor } from "../avatar/color";
import type {
  LeaderboardItem,
  LeaderboardProjection,
  ReactionMetric,
  ReactionPeriod,
  TeamActivityProjection,
  TeamGoalStatus,
  TeamMemberProjection,
} from "../domain/types";
import { activities, players, TEAM_NAME, WEEKLY_GOAL } from "./mockData";

export interface SocialGateway {
  teamActivity(): Promise<TeamActivityProjection>;
  leaderboard(
    period: ReactionPeriod,
    metric: ReactionMetric,
  ): Promise<LeaderboardProjection>;
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

interface APILeaderboardItem {
  rank: number;
  playerId: string;
  firstName: string;
  lastInitial: string;
  value: number;
  effortPoints: number;
  sessions: number;
  streakDays: number;
  consistencyDays: number;
}

interface APILeaderboard extends Omit<LeaderboardProjection, "items"> {
  items: APILeaderboardItem[];
}

class HTTPSocialGateway implements SocialGateway {
  constructor(private readonly teamID: string) {}

  async teamActivity(): Promise<TeamActivityProjection> {
    const response = await this.request(
      `/v1/teams/${encodeURIComponent(this.teamID)}/activity`,
    );
    const body = (await response.json()) as APITeamActivity;
    return { ...body, members: body.members.map(fromAPITeamMember) };
  }

  async leaderboard(
    period: ReactionPeriod,
    metric: ReactionMetric,
  ): Promise<LeaderboardProjection> {
    const query = new URLSearchParams({ period, metric });
    const response = await this.request(
      `/v1/teams/${encodeURIComponent(this.teamID)}/leaderboards?${query}`,
    );
    const body = (await response.json()) as APILeaderboard;
    return { ...body, items: body.items.map(fromAPILeaderboardItem) };
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

class LocalSocialGateway implements SocialGateway {
  async teamActivity(): Promise<TeamActivityProjection> {
    const members = players.map<TeamMemberProjection>((player) => ({
      ...player,
      consistencyDays: player.consistency,
      goalStatus: goalStatus(player.weeklySessions),
      challengeCompleted: player.weeklySessions >= WEEKLY_GOAL,
    }));
    const weekStart = daysFromMonday(new Date());
    const challengeActivity = activities[0];
    return {
      team: {
        id: "team-hill-striders",
        name: TEAM_NAME,
        weeklyGoal: WEEKLY_GOAL,
      },
      weekStart: localDate(weekStart),
      weekEnd: localDate(addDays(weekStart, 6)),
      teamSessions: members.reduce(
        (total, player) => total + player.weeklySessions,
        0,
      ),
      membersMeetingGoal: members.filter(
        (player) => player.weeklySessions >= WEEKLY_GOAL,
      ).length,
      currentChallenge: {
        id: "prototype-hill-sprints",
        activityDefinitionId: challengeActivity.id,
        activityName: challengeActivity.name,
        targetValue: challengeActivity.defaultValue,
        targetUnit: challengeActivity.unit,
        startsOn: localDate(weekStart),
        dueOn: localDate(addDays(weekStart, 6)),
        completedCount: members.filter((player) => player.challengeCompleted)
          .length,
      },
      members,
    };
  }

  async leaderboard(
    period: ReactionPeriod,
    metric: ReactionMetric,
  ): Promise<LeaderboardProjection> {
    const items = players
      .map<LeaderboardItem>((player) => ({
        ...player,
        rank: 0,
        value:
          metric === "effort"
            ? player.effortPoints
            : metric === "streaks"
              ? player.currentStreak
              : player.consistency,
        sessions: player.weeklySessions,
        streakDays: player.currentStreak,
        consistencyDays: player.consistency,
      }))
      .sort(
        (left, right) =>
          right.value - left.value ||
          right.consistencyDays - left.consistencyDays ||
          left.firstName.localeCompare(right.firstName),
      )
      .map((player, index) => ({ ...player, rank: index + 1 }));
    const today = new Date();
    return {
      team: {
        id: "team-hill-striders",
        name: TEAM_NAME,
        weeklyGoal: WEEKLY_GOAL,
      },
      period,
      metric,
      periodStart: localDate(
        period === "weekly"
          ? daysFromMonday(today)
          : period === "thirty_days"
            ? addDays(today, -29)
            : new Date(today.getFullYear(), 0, 1),
      ),
      periodEnd: localDate(today),
      teamSessions: items.reduce((total, player) => total + player.sessions, 0),
      teamEffortPoints: items.reduce(
        (total, player) => total + player.effortPoints,
        0,
      ),
      items,
    };
  }
}

export function createSocialGateway(
  connected = false,
  teamID = "team-hill-striders",
): SocialGateway {
  return connected ? new HTTPSocialGateway(teamID) : new LocalSocialGateway();
}

function fromAPITeamMember(member: APITeamMember): TeamMemberProjection {
  return {
    ...socialIdentity(member),
    weeklySessions: member.weeklySessions,
    effortPoints: member.effortPoints,
    currentStreak: member.currentStreak,
    consistency: member.consistencyDays,
    consistencyDays: member.consistencyDays,
    goalStatus: member.goalStatus,
    challengeCompleted: member.challengeCompleted,
  };
}

function fromAPILeaderboardItem(item: APILeaderboardItem): LeaderboardItem {
  return {
    ...socialIdentity(item),
    rank: item.rank,
    value: item.value,
    weeklySessions: item.sessions,
    effortPoints: item.effortPoints,
    currentStreak: item.streakDays,
    consistency: item.consistencyDays,
    sessions: item.sessions,
    streakDays: item.streakDays,
    consistencyDays: item.consistencyDays,
  };
}

function socialIdentity(identity: {
  playerId: string;
  firstName: string;
  lastInitial: string;
}) {
  const id = identity.playerId;
  const lastInitial = `${identity.lastInitial.replace(/\.$/, "")}.`;
  return {
    id,
    firstName: identity.firstName,
    lastInitial,
    initials:
      `${identity.firstName[0] ?? ""}${lastInitial[0] ?? ""}`.toUpperCase(),
    avatarColor: playerColor(id),
  };
}

function goalStatus(sessions: number): TeamGoalStatus {
  if (sessions >= WEEKLY_GOAL) return "completed";
  if (sessions === WEEKLY_GOAL - 1) return "one_away";
  return "keep_going";
}

function daysFromMonday(value: Date): Date {
  const result = new Date(value);
  const offset = (result.getDay() + 6) % 7;
  result.setDate(result.getDate() - offset);
  return result;
}

function addDays(value: Date, amount: number): Date {
  const result = new Date(value);
  result.setDate(result.getDate() + amount);
  return result;
}

function localDate(value: Date): string {
  const year = value.getFullYear();
  const month = String(value.getMonth() + 1).padStart(2, "0");
  const day = String(value.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}
