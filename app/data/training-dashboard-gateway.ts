import type {
  ActivityDefinition,
  ActivityId,
  InputKind,
  TrainingDashboard,
} from "../domain/types";
import { activities, initialEntries, TEAM_NAME, WEEKLY_GOAL } from "./mockData";
import {
  activityDays,
  currentStreak,
  entriesWithinDays,
} from "../domain/rules";
import { activityPresentation } from "../content/activities";

export interface TrainingDashboardGateway {
  get(): Promise<TrainingDashboard>;
  recordPlannedRest(planID: string, dayIndex: number): Promise<void>;
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

  async recordPlannedRest(planID: string, dayIndex: number): Promise<void> {
    const response = await fetch("/api/zoomigo/v1/me/planned-rest-check-ins", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Idempotency-Key": crypto.randomUUID(),
      },
      body: JSON.stringify({ teamId: this.teamID, planId: planID, dayIndex }),
    });
    if (!response.ok) throw new Error("Planned rest could not be saved.");
  }
}

class LocalTrainingDashboardGateway implements TrainingDashboardGateway {
  async recordPlannedRest(): Promise<void> {}

  async get(): Promise<TrainingDashboard> {
    const streak = currentStreak(initialEntries);
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
        weeklySessions: entriesWithinDays(initialEntries, 7).length,
        rolling30Sessions: entriesWithinDays(initialEntries, 30).length,
        momentumScore: 68,
        currentCheckInStreak: streak,
        currentStreak: streak,
        longestStreak: 12,
        effortPoints: 520,
        activityDays: activityDays(initialEntries),
      },
      teamPulse: { activeThisWeek: 8 },
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
