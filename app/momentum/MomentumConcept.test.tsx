import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { afterEach, describe, expect, it } from "vitest";
import { MomentumConcept } from "./MomentumConcept";

afterEach(cleanup);

function openDemo() {
  fireEvent.click(screen.getByRole("tab", { name: "Interactive demo" }));
}

describe("Momentum concept review", () => {
  it("describes a continuous personalized model instead of a finite weekly checklist", () => {
    render(<MomentumConcept />);

    expect(
      screen.getByRole("heading", { name: "Momentum design draft" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("heading", {
        name: /continuous, personalized signal/i,
      }),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/goal means complete.*stretch is optional/i),
    ).toBeInTheDocument();
    expect(screen.queryByText(/3 of 3/i)).not.toBeInTheDocument();
  });

  it("opens with a prominent non-terminal gauge and a goal plus stretch prescription", () => {
    render(<MomentumConcept />);
    openDemo();

    expect(
      screen.getByRole("heading", { name: "Today’s prescription" }),
    ).toBeInTheDocument();
    expect(screen.getByText("Goal · 8 reps")).toBeInTheDocument();
    expect(screen.getByText("Stretch · 10 reps")).toBeInTheDocument();
    expect(
      screen.getByRole("img", { name: /Momentum is rolling/i }),
    ).toBeInTheDocument();
    expect(screen.queryByText(/100%|3 of 3/i)).not.toBeInTheDocument();
  });

  it("shows a small private stretch effect without a second team contribution", () => {
    render(<MomentumConcept />);
    openDemo();
    fireEvent.click(screen.getByRole("button", { name: "Goal + stretch" }));

    fireEvent.click(screen.getByRole("button", { name: "Stretch reached" }));

    expect(screen.getByText("Small private boost")).toBeInTheDocument();
    expect(
      screen.getByText(/team contribution stays at one/i),
    ).toBeInTheDocument();
  });

  it("promotes recovery after hard work and keeps extra hard work out of the next action", () => {
    render(<MomentumConcept />);
    openDemo();
    fireEvent.click(screen.getByRole("button", { name: "Hard + recovery" }));

    expect(
      screen.getByRole("heading", { name: "Main work complete" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Log recovery walk" }),
    ).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /hard workout/i })).toBeNull();
  });

  it("records rest with structured controls and no upload, text field, or result", () => {
    render(<MomentumConcept />);
    openDemo();
    fireEvent.click(screen.getByRole("button", { name: "Rest day" }));
    fireEvent.click(screen.getByRole("button", { name: "Record rest day" }));

    expect(
      screen.getByRole("heading", { name: "Rest recorded" }),
    ).toBeInTheDocument();
    expect(screen.queryByRole("textbox")).toBeNull();
    expect(document.querySelector('input[type="file"]')).toBeNull();
    expect(screen.queryByText(/reps|minutes|miles/i)).toBeNull();
  });

  it("demonstrates unranked team highlights without exposing prescription results", () => {
    render(<MomentumConcept />);
    openDemo();
    fireEvent.click(screen.getByRole("button", { name: "Team highlights" }));

    expect(
      screen.getByRole("heading", { name: "Hill Striders highlights" }),
    ).toBeInTheDocument();
    expect(screen.getByText("Team plan pulse")).toBeInTheDocument();
    expect(screen.queryByText(/8 reps|10 reps|rank|1st|podium/i)).toBeNull();
  });

  it("shows three accessible gauge treatments for comparison", () => {
    render(<MomentumConcept />);
    openDemo();
    fireEvent.click(screen.getByRole("button", { name: "Gauge Lab" }));

    expect(
      screen.getByRole("img", { name: "Momentum Trail: Rolling" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("img", { name: "Flow Bar: Rolling" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("img", { name: "Orbit Gauge: Rolling" }),
    ).toBeInTheDocument();
  });
});
