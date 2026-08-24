import { fireEvent, render, screen } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { describe, expect, it, vi } from "vitest";
import { WhatsNext } from "./WhatsNext";

const plan = {
  dateLabel: "Today · Aug 23",
  activity: "Hill Sprints",
  workload: "8 reps · 6 seconds each",
  instruction: "Sprint, then walk back fully before the next start.",
  goal: "Goal · 8 reps",
  stretch: "Stretch · 10 reps",
  reasons: ["Coach-approved plan."],
};

const common = {
  plan,
  recovery: { title: "Easy recovery walk", detail: "10 minutes · relaxed" },
  extras: [
    { id: "ball-control" as const, label: "Easy ball touches · 10 minutes" },
  ],
  previewOnly: false,
  connectedError: null,
  onComplete: vi.fn().mockResolvedValue(true),
  onRecordRest: vi.fn().mockResolvedValue(undefined),
  onRecordCooldown: vi.fn().mockResolvedValue(undefined),
  onRecordExtra: vi.fn().mockResolvedValue(undefined),
};

describe("WhatsNext", () => {
  it("makes the recommended plan the single pre-completion action card", () => {
    render(
      <WhatsNext
        {...common}
        restDay={false}
        planComplete={false}
        cooldownComplete={false}
      />,
    );

    expect(screen.getByText("What’s next")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Hill Sprints" })).toBeVisible();
    expect(
      screen.getByRole("button", { name: "Log today’s plan" }),
    ).toBeVisible();
    expect(screen.queryByText("Today is in the books")).not.toBeInTheDocument();
    expect(
      screen.queryByRole("link", { name: /Team lounge/i }),
    ).not.toBeInTheDocument();
  });

  it("describes prescribed rest without leaking workout instructions", () => {
    render(
      <WhatsNext
        {...common}
        restDay
        planComplete={false}
        cooldownComplete={false}
      />,
    );

    expect(
      screen.getByText(
        "Recovery is today’s plan. Check in to count it—no workout needed.",
      ),
    ).toBeInTheDocument();
    expect(screen.queryByText(plan.instruction)).not.toBeInTheDocument();
  });

  it("recommends cooldown after training and keeps specific alternatives secondary", () => {
    render(
      <WhatsNext
        {...common}
        restDay={false}
        planComplete
        cooldownComplete={false}
      />,
    );

    expect(screen.getByRole("heading", { name: "What’s next?" })).toBeVisible();
    expect(screen.getByText("Recommended next")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /Log easy recovery walk/i }),
    ).toBeVisible();
    expect(
      screen.getByRole("link", { name: /Relax in Team lounge/i }),
    ).toHaveAttribute("href", "/team");
    expect(
      screen.getByRole("button", { name: /Easy ball touches/i }),
    ).toBeVisible();
    expect(screen.getByText("Or call it a day")).toBeInTheDocument();
  });

  it("makes Team lounge the recommendation after cooldown", () => {
    render(
      <WhatsNext {...common} restDay={false} planComplete cooldownComplete />,
    );

    expect(screen.getByText("Recommended next")).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: /Relax in Team lounge/i }),
    ).toHaveAttribute("data-recommended", "true");
    expect(screen.getByText("Cooldown logged")).toBeInTheDocument();
  });

  it("counts submitted planned rest as done without suggesting more training", () => {
    render(
      <WhatsNext {...common} restDay planComplete cooldownComplete={false} />,
    );

    expect(screen.getByText("Planned rest logged")).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: /Relax in Team lounge/i }),
    ).toHaveAttribute("data-recommended", "true");
    expect(
      screen.queryByRole("button", { name: /Easy ball touches/i }),
    ).not.toBeInTheDocument();
    expect(screen.getByText("Keep recovery easy")).toBeInTheDocument();
  });

  it("records the recommended cooldown from the card", () => {
    const onRecordCooldown = vi.fn().mockResolvedValue(undefined);
    render(
      <WhatsNext
        {...common}
        onRecordCooldown={onRecordCooldown}
        restDay={false}
        planComplete
        cooldownComplete={false}
      />,
    );

    fireEvent.click(
      screen.getByRole("button", { name: /Log easy recovery walk/i }),
    );
    expect(onRecordCooldown).toHaveBeenCalledOnce();
  });
});
