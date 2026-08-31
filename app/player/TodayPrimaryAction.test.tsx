import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type {
  ActivityDefinition,
  CurrentTrainingPlanDay,
  TrainingAssignment,
  TrainingPlanWindow,
} from "../domain/types";
import { TodayPrimaryAction } from "./TodayPrimaryAction";

describe("Today primary action", () => {
  it("keeps a completed plan day complete when an assignment remains", () => {
    render(
      <TodayPrimaryAction
        day={{ ...restDay(), completed: true }}
        plan={plan({ ...restDay(), completed: true })}
        assignment={assignment()}
        activities={[activity()]}
        onRecordRest={vi.fn()}
      />,
    );

    expect(
      screen.getByRole("heading", { name: "Done for today!" }),
    ).toBeVisible();
    expect(
      screen.getByRole("link", { name: "See team progress" }),
    ).toHaveAttribute("href", "/team");
    expect(
      screen.queryByRole("link", { name: /record this workout/i }),
    ).not.toBeInTheDocument();
  });

  it("keeps an unfinished plan day as the primary action", () => {
    const day = trainingDay();
    render(
      <TodayPrimaryAction
        day={day}
        plan={plan(day)}
        assignment={assignment()}
        activities={[activity()]}
        onRecordRest={vi.fn()}
      />,
    );

    expect(
      screen.getByRole("link", { name: /record this workout/i }),
    ).toHaveAttribute(
      "href",
      "/log?planId=plan-one&dayIndex=1&blockIndex=0&activityId=hill-sprints",
    );
  });

  it("always offers a workout when no plan or assignment needs action", () => {
    render(
      <TodayPrimaryAction
        day={null}
        plan={null}
        assignment={null}
        activities={[activity()]}
        onRecordRest={vi.fn()}
      />,
    );

    expect(
      screen.getByRole("heading", { name: "Record a workout" }),
    ).toBeVisible();
    expect(
      screen.getByRole("link", { name: /choose a workout/i }),
    ).toHaveAttribute("href", "/log");
  });

  it("falls back to a usable workout when a planned activity is unavailable", () => {
    const day = trainingDay();
    render(
      <TodayPrimaryAction
        day={day}
        plan={plan(day)}
        assignment={null}
        activities={[]}
        onRecordRest={vi.fn()}
      />,
    );

    expect(
      screen.getByRole("heading", { name: "Record a workout" }),
    ).toBeVisible();
    expect(
      screen.getByRole("link", { name: /choose a workout/i }),
    ).toBeVisible();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });
});

function activity(): ActivityDefinition {
  return {
    id: "hill-sprints",
    name: "Hill Sprints",
    shortName: "Hills",
    icon: "▲",
    inputKind: "repetitions",
    unit: "reps",
    min: 1,
    max: 40,
    step: 1,
    defaultValue: 8,
    fieldLabel: "Repetitions",
    description: "Run the hill with control.",
    instructions: ["Warm up first."],
  };
}

function assignment(): TrainingAssignment {
  return {
    id: "assignment-one",
    activityDefinitionId: "hill-sprints",
    catalogKey: "hill_sprints_8x6",
    targetValue: 8,
    targetUnit: "reps",
    startsOn: "2026-08-26",
    dueOn: "2026-09-02",
    completed: false,
  };
}

function trainingDay(): CurrentTrainingPlanDay {
  return {
    planId: "plan-one",
    dayIndex: 1,
    templateName: "Speed and recovery",
    occursOn: "2026-08-27",
    kind: "training",
    focus: "speed",
    durationMinutes: 20,
    intensity: "steady",
    completed: false,
    blocks: [
      {
        blockIndex: 0,
        activityDefinitionId: "hill-sprints",
        label: "Hill sprints",
        durationMinutes: 12,
        completed: false,
      },
    ],
  };
}

function restDay(): CurrentTrainingPlanDay {
  return {
    ...trainingDay(),
    kind: "rest",
    focus: "recovery",
    durationMinutes: 0,
    intensity: "easy",
    blocks: [],
  };
}

function plan(today: CurrentTrainingPlanDay): TrainingPlanWindow {
  return {
    planId: today.planId,
    templateName: today.templateName,
    dayNumber: today.dayIndex + 1,
    dayCount: 7,
    yesterday: null,
    today,
    tomorrow: null,
    days: [today],
  };
}
