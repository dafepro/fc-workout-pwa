import { describe, expect, it } from "vitest";
import type {
  ActivityDefinition,
  TrainingDashboard,
  TrainingEntry,
} from "../domain/types";
import { connectedMomentumModel, momentumCompletionInput } from "./connected";

const activities: ActivityDefinition[] = [
  {
    id: "timed-run-walk",
    name: "Timed run/walk",
    shortName: "Run/walk",
    icon: "timer",
    inputKind: "duration",
    unit: "minutes",
    min: 5,
    max: 60,
    step: 5,
    defaultValue: 20,
    fieldLabel: "Minutes",
    description: "Alternate running and walking.",
    instructions: ["Keep a steady pace."],
  },
  {
    id: "recovery-walk-jog",
    name: "Recovery walk/jog",
    shortName: "Recovery",
    icon: "walk",
    inputKind: "duration",
    unit: "minutes",
    min: 5,
    max: 45,
    step: 5,
    defaultValue: 15,
    fieldLabel: "Minutes",
    description: "Move at an easy pace.",
    instructions: ["Keep this comfortable."],
  },
];

const dashboard: TrainingDashboard = {
  team: { id: "team-one", name: "Trailblazers", weeklyGoal: 3 },
  activities,
  currentAssignment: {
    id: "assignment-one",
    activityDefinitionId: "timed-run-walk",
    catalogKey: "timed_run_walk_20",
    targetValue: 20,
    targetUnit: "minutes",
    startsOn: "2026-08-21",
    dueOn: "2026-08-21",
    completed: true,
  },
  currentPlanDay: null,
  currentPlan: null,
  summary: {
    weeklySessions: 3,
    weeklyMomentumCredits: 3,
    momentumScore: 68,
    rolling30Sessions: 9,
    currentStreak: 4,
    currentCheckInStreak: 5,
    longestStreak: 7,
    effortPoints: 120,
    activityDays: [],
  },
  teamPulse: { activeThisWeek: 6, unlocked: true, recentActivities: [] },
  streakComparison: { templateKey: "test", value: "4", message: "Test" },
};

const entries: TrainingEntry[] = [
  {
    id: "entry-one",
    playerId: "player-one",
    activityId: "timed-run-walk",
    assignmentId: "assignment-one",
    occurredAt: "2026-08-21T12:00:00Z",
    value: 25,
    unit: "minutes",
    effortLevel: 4,
    exhaustionLevel: 3,
    createdAt: "2026-08-21T12:00:00Z",
    deleteEligibleUntil: "2026-08-22T12:00:00Z",
  },
];

describe("connected Momentum", () => {
  it("projects the real assignment, team, and persisted player history", () => {
    const model = connectedMomentumModel(
      dashboard,
      entries,
      "player-one",
      new Date("2026-08-21T18:00:00Z"),
    );

    expect(model.plan.activity).toBe("Timed run/walk");
    expect(model.teamName).toBe("Trailblazers");
    expect(model.state.primaryComplete).toBe(true);
    expect(model.state.primaryChoice).toBe("stretch");
    expect(model.state.history[0]).toMatchObject({
      id: "entry-one",
      title: "Timed run/walk",
      detail: "25 minutes",
    });
    expect(model.recentPlanFollowers).toBe(6);
  });

  it("builds a real training entry against the current assignment", () => {
    const model = connectedMomentumModel(
      {
        ...dashboard,
        currentAssignment: {
          ...dashboard.currentAssignment!,
          completed: false,
        },
      },
      [],
      "player-one",
      new Date("2026-08-21T18:00:00Z"),
    );

    expect(
      momentumCompletionInput(model, {
        choice: "stretch",
        feeling: "tired",
        planSelection: "prescribed",
      }),
    ).toMatchObject({
      activityId: "timed-run-walk",
      assignmentId: "assignment-one",
      value: 25,
      unit: "minutes",
      effortLevel: 3,
      exhaustionLevel: 4,
    });
  });

  it("keeps historical assignment entries in history without completing today", () => {
    const model = connectedMomentumModel(
      {
        ...dashboard,
        currentAssignment: {
          ...dashboard.currentAssignment!,
          dueOn: "2026-08-22",
          completed: false,
        },
      },
      entries,
      "player-one",
      new Date("2026-08-22T18:00:00Z"),
    );

    expect(model.state.primaryComplete).toBe(false);
    expect(model.state.primaryChoice).toBeNull();
    expect(model.state.history).toHaveLength(1);
  });

  it("uses a published plan day ahead of a legacy assignment", () => {
    const model = connectedMomentumModel(
      {
        ...dashboard,
        currentPlanDay: {
          planId: "plan-one",
          dayIndex: 0,
          templateName: "Return to rhythm",
          occursOn: "2026-08-21",
          kind: "training",
          focus: "endurance",
          durationMinutes: 20,
          intensity: "easy",
          completed: false,
          blocks: [
            {
              blockIndex: 0,
              activityDefinitionId: "timed-run-walk",
              label: "Timed run or walk",
              durationMinutes: 20,
              completed: false,
            },
          ],
        },
      },
      [],
      "player-one",
      new Date("2026-08-21T18:00:00Z"),
    );

    expect(model.plan).toMatchObject({
      activity: "Timed run/walk",
      workload: "20 min · Easy",
    });
    expect(model.assignment).toBeNull();
    expect(
      momentumCompletionInput(model, {
        choice: "goal",
        feeling: "good",
        planSelection: "prescribed",
      }),
    ).toMatchObject({
      activityId: "timed-run-walk",
      assignmentId: undefined,
      value: 20,
    });
  });

  it("projects a completed planned-rest day without a workout", () => {
    const model = connectedMomentumModel(
      {
        ...dashboard,
        currentPlanDay: {
          planId: "plan-one",
          dayIndex: 0,
          templateName: "In-season balance",
          occursOn: "2026-08-21",
          kind: "rest",
          focus: "recovery",
          durationMinutes: 0,
          intensity: "easy",
          completed: true,
          blocks: [],
        },
      },
      [],
      "player-one",
      new Date("2026-08-21T18:00:00Z"),
    );

    expect(model.state.dayKind).toBe("rest");
    expect(model.state.primaryComplete).toBe(true);
    expect(model.plan.activity).toBe("Planned recovery day");
  });
});
