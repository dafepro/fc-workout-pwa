import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { describe, expect, it, vi } from "vitest";
import type { TrainingPlanWindow } from "../../domain/types";
import type { DailyDropGateway } from "../../data/daily-drop-gateway";
import { CompactPlayerStatus } from "./CompactPlayerStatus";
import { PlanWeekStrip } from "./PlanWeekStrip";
import { TodayPlanHero } from "./TodayPlanHero";
import { TodaySecondaryActions } from "./TodaySecondaryActions";
import { TodayDashboardError } from "./ConsolidatedToday";

const plan: TrainingPlanWindow = {
  planId: "plan-one",
  templateName: "Speed and recovery",
  dayNumber: 2,
  dayCount: 7,
  yesterday: null,
  today: planDay(1, "2026-08-24", "Hill Sprints"),
  tomorrow: planDay(2, "2026-08-25", "Easy Run"),
  days: [
    { ...planDay(0, "2026-08-23", "Speed Session"), completed: true },
    planDay(1, "2026-08-24", "Hill Sprints"),
    planDay(2, "2026-08-25", "Easy Run"),
    restDay(3, "2026-08-26"),
    planDay(4, "2026-08-27", "Sprint Session"),
    planDay(5, "2026-08-28", "Easy Conditioning"),
    restDay(6, "2026-08-29"),
  ],
};

describe("focused Today components", () => {
  it("keeps Momentum informational and compact", () => {
    render(<CompactPlayerStatus momentumScore={21.5} checkInStreak={5} />);

    const summary = screen.getByRole("link", {
      name: /Momentum 21.5, 5-day check-in streak/i,
    });
    expect(summary).toHaveAttribute("href", "/progress");
    expect(
      screen.getByRole("progressbar", {
        name: "Momentum 21.5 out of 100",
      }),
    ).toBeVisible();

    fireEvent.click(
      screen.getByRole("button", { name: "What Momentum means" }),
    );
    expect(screen.getByRole("status")).toHaveTextContent(
      /planned workouts, recovery, rest check-ins/i,
    );
  });

  it("expands details without allowing the plan card itself to save anything", () => {
    const onComplete = vi.fn().mockResolvedValue(true);
    render(
      <TodayPlanHero
        source="coach-plan"
        restDay={false}
        complete={false}
        previewOnly={false}
        plan={{
          activity: "Hill Sprints",
          workload: "20 min · Moderate",
          goal: "Goal · 8 reps",
          instruction: "Find a short hill with clear footing.",
          reasons: ["Speed work is followed by recovery."],
        }}
        onComplete={onComplete}
        onRecordRest={vi.fn()}
      />,
    );

    expect(screen.getByText("Today")).toBeVisible();
    expect(screen.getByRole("heading", { name: "Hill Sprints" })).toBeVisible();
    expect(
      screen.queryByText("Find a short hill with clear footing."),
    ).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Details" }));
    expect(
      screen.getByText("Find a short hill with clear footing."),
    ).toBeVisible();
    expect(onComplete).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: "Start workout" }));
    expect(screen.getByRole("button", { name: "Save workout" })).toBeVisible();
    expect(screen.getByRole("button", { name: "Goal · 8 reps" })).toHaveClass(
      "today-plan-hero__target-choice",
    );
    expect(
      screen.getByRole("button", { name: "Goal · 8 reps" }),
    ).toHaveAttribute("aria-pressed", "true");
    expect(
      screen.getByRole("button", { name: "Reach · 10 reps" }),
    ).toHaveAttribute("aria-pressed", "false");
    expect(onComplete).not.toHaveBeenCalled();
  });

  it("does not offer recording when a planned activity is unavailable", () => {
    render(
      <TodayPlanHero
        source="coach-plan"
        restDay={false}
        complete={false}
        previewOnly={false}
        actionUnavailable
        plan={{
          activity: "Footwork circuit",
          workload: "20 min · Easy",
          goal: "Goal · Complete today’s planned activity",
          instruction: "Check with your coach before starting.",
          reasons: [],
        }}
        onComplete={vi.fn()}
        onRecordRest={vi.fn()}
      />,
    );

    expect(screen.getByRole("alert")).toHaveTextContent(
      /needs an update from your coach/i,
    );
    expect(
      screen.queryByRole("button", { name: "Start workout" }),
    ).not.toBeInTheDocument();
  });

  it("turns the same hero into closure instead of adding What’s next", () => {
    render(
      <TodayPlanHero
        source="coach-plan"
        restDay={false}
        complete
        previewOnly={false}
        plan={{
          activity: "Hill Sprints",
          workload: "20 min · Moderate",
          goal: "Goal · 8 reps",
          instruction: "Find a short hill with clear footing.",
          reasons: [],
        }}
        onComplete={vi.fn()}
        onRecordRest={vi.fn()}
      />,
    );

    expect(screen.getByText("Today complete")).toBeVisible();
    expect(screen.getByText(/completed today’s plan/i)).toBeVisible();
    expect(screen.queryByText("Recommended next")).not.toBeInTheDocument();
  });

  it("summarizes all seven days without rendering seven full workout cards", () => {
    render(<PlanWeekStrip plan={plan} />);

    const overview = screen.getByRole("region", { name: "Your 7-day plan" });
    expect(within(overview).getAllByRole("listitem")).toHaveLength(7);
    expect(within(overview).getByText("Today")).toBeVisible();
    expect(within(overview).getAllByLabelText(/Locked/)).toHaveLength(5);
    expect(
      within(overview).getByRole("link", { name: "View full 7-day plan" }),
    ).toHaveAttribute("href", "/plan");
    expect(
      within(overview).queryByText("20 min · Moderate"),
    ).not.toBeInTheDocument();
  });

  it("orders secondary destinations without promotional cards", () => {
    render(<TodaySecondaryActions teamLocked />);

    const list = screen.getByRole("list", { name: "Other things you can do" });
    const items = within(list).getAllByRole("listitem");
    expect(items).toHaveLength(4);
    expect(items[0]).toHaveTextContent("Team lounge");
    expect(
      within(list).getByRole("link", { name: /Log another activity/i }),
    ).toHaveAttribute("href", "/log/additional");
    expect(
      within(list).getByRole("link", { name: /View prize boxes/i }),
    ).toHaveAttribute("href", "/prizes");
    expect(
      within(list).getByRole("link", { name: /Your momentum/i }),
    ).toHaveAttribute("href", "/progress");
  });

  it("badges prize boxes only when an unopened box is available", async () => {
    const availableGateway: DailyDropGateway = {
      status: vi.fn().mockResolvedValue({
        state: "available",
        day: "2026-08-24",
        availableCount: 3,
        pendingPlanBoxes: 2,
        nextSource: "plan_participation_3",
      }),
      claim: vi.fn(),
    };
    const { rerender } = render(
      <TodaySecondaryActions
        teamLocked={false}
        prizeBoxesConnected
        prizeBoxGateway={availableGateway}
      />,
    );

    expect(await screen.findByText("3 unopened")).toBeVisible();
    expect(screen.getByRole("status")).toHaveTextContent(
      "Prize box earned! Saved to Prize boxes.",
    );

    const claimedGateway: DailyDropGateway = {
      status: vi.fn().mockResolvedValue({
        state: "collection_complete",
        day: "2026-08-24",
        availableCount: 0,
        pendingPlanBoxes: 0,
      }),
      claim: vi.fn(),
    };
    rerender(
      <TodaySecondaryActions
        teamLocked={false}
        prizeBoxesConnected
        prizeBoxGateway={claimedGateway}
      />,
    );

    await waitFor(() =>
      expect(screen.queryByText("3 unopened")).not.toBeInTheDocument(),
    );
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
  });

  it("makes a failed connected dashboard visible and retryable", () => {
    const onRetry = vi.fn();
    render(<TodayDashboardError retrying={false} onRetry={onRetry} />);

    expect(screen.getByRole("alert")).toHaveTextContent(
      "Today’s plan could not be loaded",
    );
    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    expect(onRetry).toHaveBeenCalledOnce();
  });
});

function planDay(dayIndex: number, occursOn: string, label: string) {
  return {
    planId: "plan-one",
    dayIndex,
    templateName: "Speed and recovery",
    occursOn,
    kind: "training" as const,
    focus: "speed" as const,
    durationMinutes: 20,
    intensity: "steady" as const,
    completed: false,
    blocks: [
      {
        blockIndex: 0,
        activityDefinitionId: "hill-sprints" as const,
        label,
        durationMinutes: 20,
        completed: false,
      },
    ],
  };
}

function restDay(dayIndex: number, occursOn: string) {
  return {
    ...planDay(dayIndex, occursOn, "Planned recovery"),
    kind: "rest" as const,
    focus: "recovery" as const,
    durationMinutes: 0,
    intensity: "easy" as const,
    blocks: [],
  };
}
