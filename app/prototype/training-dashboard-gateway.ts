import type { TrainingDashboard } from "../domain/types";
import type { TrainingDashboardGateway } from "../data/training-dashboard-gateway";
import {
  activityDays,
  currentStreak,
  entriesWithinDays,
} from "../domain/rules";
import { activities, initialEntries, TEAM_NAME, WEEKLY_GOAL } from "./data";

export function createUnhostedPrototypeTrainingDashboardGateway(): TrainingDashboardGateway {
  return new UnhostedPrototypeTrainingDashboardGateway();
}

class UnhostedPrototypeTrainingDashboardGateway
  implements TrainingDashboardGateway
{
  async recordPlannedRest(): Promise<void> {}

  async get(): Promise<TrainingDashboard> {
    const streak = currentStreak(initialEntries);
    const weeklyEntries = entriesWithinDays(initialEntries, 7);
    return {
      team: {
        id: "team-hill-striders",
        name: TEAM_NAME,
        weeklyGoal: WEEKLY_GOAL,
      },
      activities,
      currentAssignment: {
        id: "prototype-hill-sprints",
        activityDefinitionId: "hill-sprints",
        catalogKey: "hill_sprints_8x6",
        targetValue: 8,
        targetUnit: "reps",
        startsOn: new Date().toISOString().slice(0, 10),
        dueOn: new Date().toISOString().slice(0, 10),
        completed: false,
      },
      currentPlanDay: null,
      currentPlan: null,
      summary: {
        weeklySessions: weeklyEntries.length,
        weeklyMomentumCredits: new Set(
          weeklyEntries.map((entry) => entry.occurredAt.slice(0, 10)),
        ).size,
        rolling30Sessions: entriesWithinDays(initialEntries, 30).length,
        momentumScore: 68,
        currentCheckInStreak: streak,
        currentStreak: streak,
        longestStreak: 12,
        effortPoints: 520,
        activityDays: activityDays(initialEntries),
      },
      teamPulse: {
        activeThisWeek: 8,
        unlocked: true,
        recentActivities: [],
      },
      streakComparison: {
        templateKey: "hammerhead_sharks",
        value: String(streak * 13),
        message: `If each streak day were hammerhead sharks, your streak would stretch ${streak * 13} feet!`,
      },
    };
  }
}
