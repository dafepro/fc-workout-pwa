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
  todayRecommendation: {
    source: "team_default",
    explanationKey: "team_default_today",
    kind: "training",
    activityDefinitionId: "timed-run-walk",
    targetValue: 20,
    targetUnit: "minutes",
    durationMinutes: 20,
    intensity: "steady",
    completed: true,
  },
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
  it("uses the server-selected suggestion and explanation on an unplanned day", () => {
    const model = connectedMomentumModel(
      {
        ...dashboard,
        currentAssignment: null,
        todayRecommendation: {
          source: "suggestion",
          explanationKey: "recent_check_in_recovery",
          kind: "training",
          activityDefinitionId: "recovery-walk-jog",
          targetValue: 15,
          targetUnit: "minutes",
          durationMinutes: 15,
          intensity: "easy",
          completed: false,
        },
      },
      [],
      "player-one",
      new Date("2026-08-21T18:00:00Z"),
    );

    expect(model.state.dayKind).toBe("training");
    expect(model.plan).toMatchObject({
      activity: "Recovery walk/jog",
      workload: "15 min · Easy",
      reasons: [
        "You checked in recently, so today’s option keeps the effort easy.",
      ],
    });
  });

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

  it("keeps the planned workout visible after every block is completed", () => {
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
          completed: true,
          blocks: [
            {
              blockIndex: 0,
              activityDefinitionId: "timed-run-walk",
              label: "Timed run or walk",
              durationMinutes: 20,
              completed: true,
            },
          ],
        },
      },
      [],
      "player-one",
      new Date("2026-08-21T18:00:00Z"),
    );

    expect(model.state.dayKind).toBe("training");
    expect(model.state.primaryComplete).toBe(true);
    expect(model.plan.activity).toBe("Timed run/walk");
  });

  it("advances a multi-block day to the first unfinished block", () => {
    const model = connectedMomentumModel(
      {
        ...dashboard,
        activities: activities.map((activity) =>
          activity.id === "recovery-walk-jog"
            ? { ...activity, defaultValue: 20 }
            : activity,
        ),
        currentPlanDay: {
          planId: "plan-one",
          dayIndex: 0,
          templateName: "Speed and recovery",
          occursOn: "2026-08-21",
          kind: "training",
          focus: "recovery",
          durationMinutes: 35,
          intensity: "steady",
          completed: false,
          blocks: [
            {
              blockIndex: 0,
              activityDefinitionId: "timed-run-walk",
              label: "Timed run or walk",
              durationMinutes: 20,
              completed: true,
            },
            {
              blockIndex: 1,
              activityDefinitionId: "recovery-walk-jog",
              label: "Recovery walk or jog",
              durationMinutes: 15,
              completed: false,
            },
          ],
        },
      },
      [],
      "player-one",
      new Date("2026-08-21T18:00:00Z"),
    );

    expect(model.plan.activity).toBe("Recovery walk/jog");
    expect(model.plan.goal).toBe("Goal · 15 minutes");
    expect(
      momentumCompletionInput(model, {
        choice: "goal",
        feeling: "good",
        planSelection: "prescribed",
      }),
    ).toMatchObject({
      activityId: "recovery-walk-jog",
      value: 15,
      plan: { planId: "plan-one", dayIndex: 0, blockIndex: 1 },
    });
  });

  it("keeps a training day truthful when its catalog activity is unavailable", () => {
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
              activityDefinitionId: "retired-activity" as never,
              label: "Footwork circuit",
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

    expect(model.state.dayKind).toBe("training");
    expect(model.plan).toMatchObject({
      activity: "Footwork circuit",
      workload: "20 min · Easy",
    });
    expect(model.plan.activity).not.toBe("Planned recovery day");
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
