import type {
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
