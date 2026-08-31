import type {
  ActivityDefinition,
  ActivityId,
  InputKind,
  TrainingDashboard,
} from "../domain/types";
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

class ConnectedTrainingDashboardGateway implements TrainingDashboardGateway {
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

export function createConnectedTrainingDashboardGateway(
  teamID: string,
): TrainingDashboardGateway {
  return new ConnectedTrainingDashboardGateway(teamID);
}
