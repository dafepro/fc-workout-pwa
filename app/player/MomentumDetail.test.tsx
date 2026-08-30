import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { MomentumDetail } from "./MomentumDetail";

vi.mock("../state/auth-context", () => ({
  useOptionalAuth: () => null,
}));

describe("MomentumDetail", () => {
  it("uses distinct weekly check-ins for safe progress guidance", () => {
    render(
      <MomentumDetail
        momentumScore={68.5}
        weeklyCheckIns={2}
        weeklyGoal={3}
        checkInStreak={4}
        rollingFiveActiveDays={2}
      />,
    );

    expect(screen.getByRole("heading", { name: "On a roll" })).toBeVisible();
    expect(
      screen.getByRole("progressbar", { name: "Momentum: 68.5 out of 100" }),
    ).toHaveAttribute("aria-valuenow", "68.5");
    expect(
      screen.getByText(/2 check-ins this week.*1 more reaches/i),
    ).toBeVisible();
    expect(screen.getByText("4-day check-in streak")).toBeVisible();
    expect(
      screen.getByText("2 of 3 active days in your rolling 5-day window"),
    ).toBeVisible();
    expect(screen.getByText(/Only you can see this habit/)).toBeVisible();
  });
});
