import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { MomentumStatus } from "./MomentumStatus";

describe("MomentumStatus", () => {
  it("presents the score, named state, and check-in streak accessibly", () => {
    render(<MomentumStatus momentumScore={68.54} checkInStreak={4} />);

    expect(screen.getByRole("heading", { name: "On a roll" })).toBeVisible();
    expect(screen.getByText("68.5 Momentum")).toBeVisible();
    expect(screen.getByText("4-day check-in streak")).toBeVisible();
    expect(
      screen.getByRole("progressbar", { name: "Momentum: 68.5 out of 100" }),
    ).toHaveAttribute("aria-valuenow", "68.5");
  });

  it("explains the bounded participation rules without maximizing advice", () => {
    render(<MomentumStatus momentumScore={5} checkInStreak={1} />);

    const explanation = screen.getByRole("button", {
      name: "What Momentum means",
    });
    expect(explanation).toHaveAttribute("aria-expanded", "false");
    fireEvent.click(explanation);

    expect(explanation).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByRole("status")).toHaveTextContent(
      "Regular check-ins matter most. A second and third activity add smaller boosts, and planned rest counts without stacking.",
    );
    expect(screen.getByRole("status")).not.toHaveTextContent(
      /save|protect|extra workout/i,
    );
  });
});
