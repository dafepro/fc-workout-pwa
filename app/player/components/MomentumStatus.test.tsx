import { render, screen } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { describe, expect, it } from "vitest";
import { MomentumStatus } from "./MomentumStatus";

describe("MomentumStatus", () => {
  it("shows a real weekly gauge, activity streak, and a specific way to fill it", () => {
    render(
      <MomentumStatus
        weeklySessions={2}
        weeklyGoal={3}
        currentStreak={4}
        restDay={false}
        planComplete={false}
      />,
    );

    expect(screen.getByText("Building")).toBeInTheDocument();
    expect(screen.getByText("4-day activity streak")).toBeInTheDocument();
    expect(
      screen.getByText(
        "1 more plan day completes this week’s goal. Today’s recommended plan is the clearest next step.",
      ),
    ).toBeInTheDocument();

    const gauge = screen.getByRole("progressbar", {
      name: "Weekly Momentum: 2 of 3 plan days",
    });
    expect(gauge).toHaveTextContent("2 of 3");
    expect(gauge).toHaveAttribute("aria-valuenow", "2");
    expect(gauge).toHaveAttribute("aria-valuemax", "3");
  });

  it("uses singular streak copy without pressuring another workout", () => {
    render(
      <MomentumStatus
        weeklySessions={4}
        weeklyGoal={3}
        currentStreak={1}
        restDay={false}
        planComplete={true}
      />,
    );

    expect(screen.getByText("On a roll")).toBeInTheDocument();
    expect(
      screen.getByRole("progressbar", {
        name: "Weekly Momentum: 4 of 3 plan days",
      }),
    ).toHaveTextContent("4 of 3");
    expect(screen.getByText("1-day activity streak")).toBeInTheDocument();
    expect(
      screen.getByText(
        "Weekly goal complete. Recovery is a good next move; there’s no need to add more.",
      ),
    ).toBeInTheDocument();
    expect(screen.queryByText(/save your streak/i)).not.toBeInTheDocument();
  });

  it("protects a planned rest day even when the weekly gauge is not full", () => {
    render(
      <MomentumStatus
        weeklySessions={1}
        weeklyGoal={3}
        currentStreak={0}
        restDay
        planComplete={false}
      />,
    );

    expect(screen.getByText("Started")).toBeInTheDocument();
    expect(
      screen.getByText(
        "2 more plan days complete this week’s goal. Today, stick with planned recovery.",
      ),
    ).toBeInTheDocument();
  });
});
