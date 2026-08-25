import { render, screen } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { describe, expect, it } from "vitest";
import type { TrainingPlanWindow } from "../../domain/types";
import { PlanOverview } from "./PlanOverview";

const today = {
  planId: "plan-one",
  dayIndex: 1,
  templateName: "Speed and recovery",
  occursOn: "2026-08-24",
  kind: "training" as const,
  focus: "speed" as const,
  durationMinutes: 20,
  intensity: "steady" as const,
  completed: false,
  blocks: [
    {
      blockIndex: 0,
      activityDefinitionId: "hill-sprints" as const,
      label: "Hill Sprints",
      durationMinutes: 20,
      completed: false,
    },
  ],
};

const plan: TrainingPlanWindow = {
  planId: "plan-one",
  templateName: "Speed and recovery",
  dayNumber: 2,
  dayCount: 3,
  yesterday: null,
  today,
  tomorrow: { ...today, dayIndex: 2, occursOn: "2026-08-25" },
  days: [
    { ...today, dayIndex: 0, occursOn: "2026-08-23", completed: true },
    today,
    { ...today, dayIndex: 2, occursOn: "2026-08-25" },
  ],
};

describe("PlanOverview", () => {
  it("shows every plan day while keeping future actions locked", () => {
    render(<PlanOverview plan={plan} />);

    expect(
      screen.getByRole("heading", { name: "Speed and recovery" }),
    ).toBeVisible();
    expect(screen.getByText("Day 2 of 3")).toBeVisible();
    expect(screen.getAllByRole("article")).toHaveLength(3);
    expect(
      screen.getByRole("link", { name: /Tuesday.*Upcoming/i }),
    ).toHaveAttribute("href", "/plan/2");
    expect(
      screen.queryByRole("button", { name: /Start Tuesday/i }),
    ).not.toBeInTheDocument();
    const back = screen.getByRole("link", { name: "Back to Today" });
    const heading = screen.getByRole("heading", { name: "Speed and recovery" });
    expect(
      back.compareDocumentPosition(heading) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
  });
});
