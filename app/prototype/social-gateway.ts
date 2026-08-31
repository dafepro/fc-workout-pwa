import type {
  LeaderboardItem,
  LeaderboardProjection,
  ReactionMetric,
  ReactionPeriod,
  TeamActivityProjection,
  TeamGoalStatus,
  TeamMemberProjection,
} from "../domain/types";
import type { SocialGateway } from "../data/social-gateway";
import { activities, players, TEAM_NAME, WEEKLY_GOAL } from "./data";

export function createUnhostedPrototypeSocialGateway(): SocialGateway {
  return new UnhostedPrototypeSocialGateway();
}

class UnhostedPrototypeSocialGateway implements SocialGateway {
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
