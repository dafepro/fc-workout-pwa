import { render, screen } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { describe, expect, it } from "vitest";
import type { TrainingPlanWindow } from "../../domain/types";
import { PlanTriptych } from "./PlanTriptych";

const window: TrainingPlanWindow = {
  planId: "plan-one",
  templateName: "Speed and recovery",
  dayNumber: 2,
  dayCount: 7,
  yesterday: {
    planId: "plan-one",
    templateName: "Speed and recovery",
    occursOn: "2026-08-23",
    kind: "training",
    focus: "speed",
    durationMinutes: 20,
    intensity: "hard",
    completed: true,
    blocks: [
      {
        activityDefinitionId: "hill-sprints",
        label: "Hill sprints",
        durationMinutes: 12,
      },
    ],
  },
  today: {
    planId: "plan-one",
    templateName: "Speed and recovery",
    occursOn: "2026-08-24",
    kind: "recovery",
    focus: "recovery",
    durationMinutes: 15,
    intensity: "easy",
    completed: false,
    blocks: [
      {
        activityDefinitionId: "recovery-walk-jog",
        label: "Recovery walk or jog",
        durationMinutes: 15,
      },
    ],
  },
  tomorrow: {
    planId: "plan-one",
    templateName: "Speed and recovery",
    occursOn: "2026-08-25",
    kind: "rest",
    focus: "recovery",
    durationMinutes: 0,
    intensity: "easy",
    completed: false,
    blocks: [],
  },
};

describe("PlanTriptych", () => {
  it("frames the actionable current day between calm plan context", () => {
    render(
      <PlanTriptych plan={window}>
        <button type="button">Review today’s plan</button>
      </PlanTriptych>,
    );

    expect(screen.getByText("Coach plan · Day 2 of 7")).toBeVisible();
    expect(screen.getByText("Speed and recovery")).toBeVisible();
    expect(screen.getByText("Completed")).toBeVisible();
    expect(screen.getByText("Tomorrow")).toBeVisible();
    expect(screen.getByText("Preview")).toBeVisible();
    expect(
      screen.getByRole("button", { name: "Review today’s plan" }),
    ).toBeVisible();
    expect(
      screen.queryByRole("button", { name: /Tomorrow/i }),
    ).not.toBeInTheDocument();
  });
});
