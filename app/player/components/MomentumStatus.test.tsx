import { render, screen, within } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { describe, expect, it } from "vitest";
import { MomentumStatus } from "./MomentumStatus";

describe("MomentumStatus", () => {
  it("features the composite score and supporting check-in streak", () => {
    render(
      <MomentumStatus
        momentumScore={68.5}
        weeklyCheckIns={2}
        weeklyGoal={3}
        checkInStreak={4}
      />,
    );

    expect(screen.getByText("On a roll")).toBeInTheDocument();
    expect(screen.getByText("4-day check-in streak")).toBeInTheDocument();
    expect(
      screen.getByText(
        "2 check-ins this week. 1 more reaches your team’s target.",
      ),
    ).toBeInTheDocument();
    expect(
      screen.queryByText("You showed up. Keep that rhythm going."),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByText(
        "Regular check-ins build it most. A second and third activity add smaller boosts; more won’t change it.",
      ),
    ).not.toBeInTheDocument();

    const advice = screen.getByTestId("momentum-advice");
    expect(advice).toHaveTextContent(
      "2 check-ins this week. 1 more reaches your team’s target.",
    );
    expect(
      within(advice).getByText(/show up on different days/i),
    ).toHaveTextContent(
      "Show up on different days for the biggest lift. A second and third activity add smaller boosts; planned rest counts too.",
    );

    const gauge = screen.getByRole("progressbar", {
      name: "Momentum: 68.5 out of 100",
    });
    expect(gauge).toHaveTextContent("68.5");
    expect(gauge).toHaveTextContent("Momentum");
    expect(gauge).toHaveAttribute("aria-valuenow", "68.5");
    expect(gauge).toHaveAttribute("aria-valuemax", "100");
  });

  it("moves the weekly target into encouragement after it is reached", () => {
    render(
      <MomentumStatus
        momentumScore={42}
        weeklyCheckIns={4}
        weeklyGoal={3}
        checkInStreak={1}
      />,
    );

    expect(screen.getByText("Building")).toBeInTheDocument();
    expect(screen.getByText("1-day check-in streak")).toBeInTheDocument();
    expect(
      screen.getByText(
        "You reached your team’s 3-check-in target this week. Nice consistency.",
      ),
    ).toBeInTheDocument();
    expect(screen.queryByText(/of 3/i)).not.toBeInTheDocument();
  });

  it("keeps the initial state encouraging without presenting a weekly fraction", () => {
    render(
      <MomentumStatus
        momentumScore={0}
        weeklyCheckIns={0}
        weeklyGoal={3}
        checkInStreak={0}
      />,
    );

    expect(screen.getByText("Ready")).toBeInTheDocument();
    expect(
      screen.getByText(
        "Your first check-in starts this week’s team target. Planned rest counts too.",
      ),
    ).toBeInTheDocument();
  });
});
