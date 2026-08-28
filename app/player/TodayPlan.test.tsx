import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { describe, expect, it, vi } from "vitest";
import type {
  CurrentTrainingPlanDay,
  TrainingPlanWindow,
} from "../domain/types";
import { PlanWeekStrip } from "./PlanWeekStrip";
import { TodayPlanHero } from "./TodayPlanHero";

describe("canonical Today plan", () => {
  it("opens the next incomplete predefined block in the existing log flow", () => {
    render(
      <TodayPlanHero
        day={trainingDay()}
        dayNumber={2}
        dayCount={7}
        activities={[{ id: "hill-sprints", name: "Hill Sprints" }]}
        onRecordRest={vi.fn()}
      />,
    );

    expect(screen.getByRole("heading", { name: "Hill Sprints" })).toBeVisible();
    expect(screen.getByText("20 min")).toBeVisible();
    expect(screen.getByText("Steady")).toBeVisible();
    expect(screen.getByText(/Day 2 of 7/)).toBeVisible();
    expect(
      screen.getByRole("link", { name: /Record this workout/i }),
    ).toHaveAttribute(
      "href",
      "/log?planId=plan-one&dayIndex=1&blockIndex=0&activityId=hill-sprints",
    );
    expect(
      screen.queryByRole("link", { name: /alternative/i }),
    ).not.toBeInTheDocument();
  });

  it("records planned rest without creating a workout", async () => {
    const onRecordRest = vi.fn().mockResolvedValue(undefined);
    render(
      <TodayPlanHero
        day={restDay()}
        dayNumber={4}
        dayCount={7}
        activities={[]}
        onRecordRest={onRecordRest}
      />,
    );

    fireEvent.click(
      screen.getByRole("button", { name: "Check in for planned rest" }),
    );
    await waitFor(() =>
      expect(onRecordRest).toHaveBeenCalledWith("plan-one", 3),
    );
    expect(screen.queryByText(/effort/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/tired/i)).not.toBeInTheDocument();
  });

  it("keeps the full plan summary inside Today instead of linking to another view", () => {
    const plan: TrainingPlanWindow = {
      planId: "plan-one",
      templateName: "Speed and recovery",
      dayNumber: 2,
      dayCount: 7,
      yesterday: null,
      today: trainingDay(),
      tomorrow: { ...trainingDay(), dayIndex: 2, occursOn: "2026-08-25" },
      days: [
        {
          ...trainingDay(),
          dayIndex: 0,
          occursOn: "2026-08-23",
          completed: true,
        },
        trainingDay(),
        { ...trainingDay(), dayIndex: 2, occursOn: "2026-08-25" },
        restDay(),
        { ...trainingDay(), dayIndex: 4, occursOn: "2026-08-27" },
        { ...trainingDay(), dayIndex: 5, occursOn: "2026-08-28" },
        { ...restDay(), dayIndex: 6, occursOn: "2026-08-29" },
      ],
    };
    render(<PlanWeekStrip plan={plan} />);

    const region = screen.getByRole("region", { name: "Your 7-day plan" });
    expect(within(region).getAllByRole("listitem")).toHaveLength(7);
    expect(within(region).getByText("Today")).toBeVisible();
    expect(within(region).queryByRole("link")).not.toBeInTheDocument();
  });
});

function trainingDay(): CurrentTrainingPlanDay {
  return {
    planId: "plan-one",
    dayIndex: 1,
    templateName: "Speed and recovery",
    occursOn: "2026-08-24",
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
    dayIndex: 3,
    occursOn: "2026-08-26",
    kind: "rest",
    focus: "recovery",
    durationMinutes: 0,
    intensity: "easy",
    blocks: [],
  };
}
