import { fireEvent, render, screen } from "@testing-library/react";
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
        checkInStreak={4}
        rollingFiveActiveDays={2}
      />,
    );

    expect(screen.getByRole("heading", { name: "On a roll" })).toBeVisible();
    expect(screen.getByText("2 check-in days this week")).toBeVisible();
    fireEvent.click(screen.getByText("How Momentum works"));
    expect(
      screen.getByRole("progressbar", { name: "Momentum: 68.5 out of 100" }),
    ).toHaveAttribute("aria-valuenow", "68.5");
    expect(
      screen.getByText(/Your Team goal counts training sessions separately/),
    ).toBeVisible();
    expect(screen.getByText("4-day check-in streak")).toBeVisible();
    expect(
      screen.getByText("2 of 3 active days in your rolling 5-day window"),
    ).toBeVisible();
    expect(screen.getByText(/Only you can see this habit/)).toBeVisible();
  });
});
