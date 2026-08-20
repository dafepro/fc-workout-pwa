import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { afterEach, describe, expect, it } from "vitest";
import { MomentumConcept } from "./MomentumConcept";

afterEach(cleanup);

function openFlow() {
  fireEvent.click(screen.getByRole("tab", { name: "Player flow" }));
}

function completeGoal() {
  fireEvent.click(screen.getByRole("button", { name: "Log today’s plan" }));
  fireEvent.click(screen.getByRole("button", { name: "Goal · 8 reps" }));
  fireEvent.click(screen.getByRole("button", { name: "Save check-in" }));
}

describe("Momentum concept review", () => {
  it("summarizes one cohesive personal-to-team loop", () => {
    render(<MomentumConcept />);

    expect(
      screen.getByRole("heading", { name: "One flow. Two kinds of Momentum." }),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/today’s plan.*personal Momentum.*Team Momentum/i),
    ).toBeInTheDocument();
    expect(screen.queryByText(/scenario-based/i)).not.toBeInTheDocument();
  });

  it("opens a single flow without the old scenario inventory", () => {
    render(<MomentumConcept />);
    openFlow();

    expect(
      screen.getByRole("heading", { name: "Today’s plan" }),
    ).toBeInTheDocument();
    expect(screen.getByText("Goal · 8 reps")).toBeInTheDocument();
    expect(screen.getByText("Stretch · 10 reps")).toBeInTheDocument();
    expect(
      screen.getByRole("img", { name: /Personal Momentum is rolling/i }),
    ).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Gauge Lab" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Extra logs" })).toBeNull();
    expect(
      screen.queryByRole("button", { name: "Team highlights" }),
    ).toBeNull();
  });

  it("folds consistency into the explanation for today’s prescription", () => {
    render(<MomentumConcept />);
    openFlow();

    fireEvent.click(screen.getByText("Why this plan"));

    expect(
      screen.getByText(/four recent goals.*one-rep step up/i),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/recovery follows demanding work/i),
    ).toBeInTheDocument();
  });

  it("moves from goal or stretch check-in directly into safe recovery closure", () => {
    render(<MomentumConcept />);
    openFlow();

    fireEvent.click(screen.getByRole("button", { name: "Log today’s plan" }));
    expect(
      screen.getByRole("heading", { name: "What did you complete?" }),
    ).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Stretch · 10 reps" }));
    fireEvent.click(screen.getByRole("button", { name: "Save check-in" }));

    expect(
      screen.getByRole("heading", { name: "Main work complete" }),
    ).toBeInTheDocument();
    expect(
      screen.getByText("Small private lift for stretch"),
    ).toBeInTheDocument();
    expect(screen.getByText("Easy recovery walk")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Finish for today" }),
    ).toBeInTheDocument();
  });

  it("keeps an approved alternative inside the same daily flow", () => {
    render(<MomentumConcept />);
    openFlow();

    fireEvent.click(
      screen.getByRole("button", { name: "Choose another activity" }),
    );
    expect(
      screen.getByRole("heading", { name: "Choose an approved alternative" }),
    ).toBeInTheDocument();
    fireEvent.click(
      screen.getByRole("button", { name: /Ball control circuit/ }),
    );

    expect(
      screen.getByRole("heading", { name: "What did you complete?" }),
    ).toBeInTheDocument();
    expect(screen.getByText("Ball control circuit")).toBeInTheDocument();
  });

  it("connects personal completion to one private, unranked Team Momentum view", () => {
    render(<MomentumConcept />);
    openFlow();
    completeGoal();
    fireEvent.click(screen.getByRole("button", { name: "See Team Momentum" }));

    expect(
      screen.getByRole("heading", { name: "Hill Striders Momentum" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("img", { name: /Team Momentum is building/i }),
    ).toBeInTheDocument();
    expect(screen.getByText("Steady together")).toBeInTheDocument();
    expect(screen.queryByText(/8 reps|10 reps|rank|1st|podium/i)).toBeNull();
  });

  it("uses the same Today shell for structured planned rest", () => {
    render(<MomentumConcept />);
    openFlow();
    fireEvent.click(screen.getByRole("button", { name: "Rest day" }));
    fireEvent.click(screen.getByRole("button", { name: "Record rest day" }));

    expect(
      screen.getByRole("heading", { name: "Rest recorded" }),
    ).toBeInTheDocument();
    expect(screen.queryByRole("textbox")).toBeNull();
    expect(document.querySelector('input[type="file"]')).toBeNull();
    expect(screen.queryByText(/reps|minutes|miles/i)).toBeNull();
  });
});
