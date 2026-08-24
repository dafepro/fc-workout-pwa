import type {
  ActivityDefinition,
  ActivityId,
  InputKind,
  TrainingDashboard,
} from "../domain/types";
import {
  activities,
  initialEntries,
  recentTeamActivities,
  TEAM_NAME,
  WEEKLY_GOAL,
} from "./mockData";
import {
  activityDays,
  currentStreak,
  entriesWithinDays,
} from "../domain/rules";
import { activityPresentation } from "../content/activities";

export interface TrainingDashboardGateway {
  get(): Promise<TrainingDashboard>;
}

interface APIActivityDefinition {
  id: ActivityId;
  name: string;
  inputKind: InputKind;
  unit: ActivityDefinition["unit"];
  minimumValue: number;
  maximumValue: number;
  stepValue: number;
  defaultValue: number;
}

interface APIDashboard extends Omit<TrainingDashboard, "activities"> {
  activities: APIActivityDefinition[];
}

class HTTPTrainingDashboardGateway implements TrainingDashboardGateway {
  constructor(private readonly teamID: string) {}

  async get(): Promise<TrainingDashboard> {
    const response = await fetch(
      `/api/zoomigo/v1/me/training-dashboard?teamId=${encodeURIComponent(this.teamID)}`,
      { cache: "no-store" },
    );
    if (!response.ok)
      throw new Error("Your training plan could not be loaded.");
    const body = (await response.json()) as APIDashboard;
    return {
      ...body,
      activities: body.activities.map((activity) => ({
        ...activity,
        ...activityPresentation[activity.id],
        min: activity.minimumValue,
        max: activity.maximumValue,
        step: activity.stepValue,
      })),
    };
  }
}

class LocalTrainingDashboardGateway implements TrainingDashboardGateway {
  async get(): Promise<TrainingDashboard> {
    const streak = currentStreak(initialEntries);
    const today = new Date();
    const dateAt = (offset: number) => {
      const date = new Date(today);
      date.setUTCDate(date.getUTCDate() + offset);
      return date.toISOString().slice(0, 10);
    };
    const planDay = {
      planId: "prototype-plan",
      dayIndex: 2,
      templateName: "Speed and recovery",
      occursOn: dateAt(0),
      kind: "training" as const,
      focus: "speed" as const,
      durationMinutes: 20,
      intensity: "hard" as const,
      completed: false,
      blocks: [
        {
          blockIndex: 0,
          activityDefinitionId: "hill-sprints" as const,
          label: "Hill sprints",
          durationMinutes: 12,
          completed: false,
        },
      ],
    };
    return {
      team: {
        id: "team-hill-striders",
        name: TEAM_NAME,
        weeklyGoal: WEEKLY_GOAL,
      },
      activities,
      currentAssignment: null,
      currentPlanDay: planDay,
      currentPlan: {
        planId: planDay.planId,
        templateName: planDay.templateName,
        dayNumber: 3,
        dayCount: 7,
        yesterday: {
          ...planDay,
          dayIndex: 1,
          occursOn: dateAt(-1),
          kind: "recovery",
          focus: "recovery",
          durationMinutes: 15,
          intensity: "easy",
          completed: true,
          blocks: [
            {
              blockIndex: 0,
              activityDefinitionId: "recovery-walk-jog",
              label: "Recovery walk or jog",
              durationMinutes: 15,
              completed: true,
            },
          ],
        },
        today: planDay,
        tomorrow: {
          ...planDay,
          dayIndex: 3,
          occursOn: dateAt(1),
          kind: "rest",
          focus: "recovery",
          durationMinutes: 0,
          intensity: "easy",
          completed: false,
          blocks: [],
        },
      },
      summary: {
        weeklySessions: entriesWithinDays(initialEntries, 7).length,
        weeklyMomentumCredits: entriesWithinDays(initialEntries, 7).length,
        momentumScore: 68,
        rolling30Sessions: entriesWithinDays(initialEntries, 30).length,
        currentStreak: streak,
        currentCheckInStreak: streak,
        longestStreak: 12,
        effortPoints: 520,
        activityDays: activityDays(initialEntries),
      },
      teamPulse: {
        activeThisWeek: 8,
        unlocked: true,
        recentActivities: recentTeamActivities,
      },
      streakComparison: {
        templateKey: "hammerhead_sharks",
        value: String(streak * 13),
        message: `If each streak day were hammerhead sharks, your streak would stretch ${streak * 13} feet!`,
      },
    };
  }
}

export function createTrainingDashboardGateway(
  connected = false,
  teamID = "team-hill-striders",
): TrainingDashboardGateway {
  return connected
    ? new HTTPTrainingDashboardGateway(teamID)
    : new LocalTrainingDashboardGateway();
}
