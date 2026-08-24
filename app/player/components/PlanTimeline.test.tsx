import { fireEvent, render, screen } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { describe, expect, it } from "vitest";
import type {
  CurrentTrainingPlanDay,
  TrainingPlanWindow,
} from "../../domain/types";
import { PlanTimeline } from "./PlanTimeline";

const today: CurrentTrainingPlanDay = {
  planId: "plan-one",
  dayIndex: 3,
  templateName: "Speed and recovery",
  occursOn: "2026-08-24",
  kind: "training",
  focus: "speed",
  durationMinutes: 20,
  intensity: "hard",
  completed: false,
  blocks: [
    {
      blockIndex: 0,
      activityDefinitionId: "hill-sprints",
      label: "Hill sprints",
      durationMinutes: 20,
      completed: false,
    },
  ],
};

const plan: TrainingPlanWindow = {
  planId: "plan-one",
  templateName: "Speed and recovery",
  dayNumber: 4,
  dayCount: 6,
  yesterday: null,
  today,
  tomorrow: null,
  days: [
    pastDay(0, "2026-08-21", "Easy run", true),
    pastDay(1, "2026-08-22", "Tempo run", false),
    {
      ...today,
      dayIndex: 2,
      occursOn: "2026-08-23",
      kind: "rest",
      focus: "recovery",
      durationMinutes: 0,
      intensity: "easy",
      blocks: [],
    },
    today,
    {
      ...today,
      dayIndex: 4,
      occursOn: "2026-08-25",
      kind: "rest",
      focus: "recovery",
      durationMinutes: 0,
      intensity: "easy",
      blocks: [],
    },
    {
      ...today,
      dayIndex: 5,
      occursOn: "2026-08-26",
      blocks: [{ ...today.blocks[0], label: "Tempo run" }],
    },
  ],
};

describe("PlanTimeline", () => {
  it("starts on today and communicates every plan-day state", () => {
    renderTimeline();

    expect(
      screen.getByRole("button", { name: /Today, Hill sprints/i }),
    ).toHaveAttribute("aria-pressed", "true");
    expect(
      screen.getByRole("button", { name: /Friday, Easy run, completed/i }),
    ).toBeVisible();
    expect(
      screen.getByRole("button", { name: /Saturday, Tempo run, missed/i }),
    ).toBeVisible();
    expect(
      screen.getByRole("button", {
        name: /Sunday, Planned rest, planned rest day/i,
      }),
    ).toBeVisible();
    expect(screen.getByText("Come back Tuesday")).toBeVisible();
    expect(screen.queryByText("No plan day")).not.toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Record planned workout" }),
    ).toBeVisible();
  });

  it("replaces logging with a return action while another day is selected", () => {
    renderTimeline();

    fireEvent.click(
      screen.getByRole("button", { name: /Wednesday, Tempo run, locked/i }),
    );

    expect(
      screen.queryByRole("button", { name: "Record planned workout" }),
    ).not.toBeInTheDocument();
    const returnButton = screen.getByRole("button", {
      name: "Jump back to today",
    });
    expect(returnButton).toBeVisible();

    fireEvent.click(returnButton);

    expect(
      screen.getByRole("button", { name: "Record planned workout" }),
    ).toBeVisible();
    expect(
      screen.getByRole("button", { name: /Today, Hill sprints/i }),
    ).toHaveAttribute("aria-pressed", "true");
  });
});

function renderTimeline() {
  render(
    <PlanTimeline
      plan={plan}
      todayDetails={{
        activity: "Hill sprints",
        workload: "20 min · Hard",
        goal: "Goal · 8 reps",
        instruction: "Find a short hill with clear footing.",
      }}
    >
      <button type="button">Record planned workout</button>
    </PlanTimeline>,
  );
}

function pastDay(
  dayIndex: number,
  occursOn: string,
  label: string,
  completed: boolean,
): CurrentTrainingPlanDay {
  return {
    ...today,
    dayIndex,
    occursOn,
    completed,
    blocks: [{ ...today.blocks[0], label, completed }],
  };
}
