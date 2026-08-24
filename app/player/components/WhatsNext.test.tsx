import { fireEvent, render, screen } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { describe, expect, it, vi } from "vitest";
import type {
  CurrentTrainingPlanDay,
  TrainingPlanWindow,
} from "../../domain/types";
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
  recentEffort: 4,
  recentTiredness: 3,
  previewOnly: false,
  connectedError: null,
  onComplete: vi.fn().mockResolvedValue(true),
  onRecordRest: vi.fn().mockResolvedValue(undefined),
  onRecordCooldown: vi.fn().mockResolvedValue(undefined),
};

const planWindow: TrainingPlanWindow = {
  planId: "plan-one",
  templateName: "Speed and recovery",
  dayNumber: 2,
  dayCount: 3,
  yesterday: null,
  today: planDay(1, "2026-08-24", "Hill Sprints"),
  tomorrow: planDay(2, "2026-08-25", "Tempo Run"),
  days: [
    { ...planDay(0, "2026-08-23", "Easy Run"), completed: true },
    planDay(1, "2026-08-24", "Hill Sprints"),
    planDay(2, "2026-08-25", "Tempo Run"),
  ],
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
      screen.getByRole("button", { name: "Record planned workout" }),
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

  it("uses the coach-plan timeline without putting logging inside a day card", () => {
    render(
      <WhatsNext
        {...common}
        planWindow={planWindow}
        restDay={false}
        planComplete={false}
        cooldownComplete={false}
      />,
    );

    const todayCard = screen.getByRole("button", {
      name: /Today, Hill Sprints/i,
    });
    expect(todayCard).toHaveAttribute("aria-current", "date");
    expect(todayCard).not.toHaveTextContent("Record planned workout");
    expect(
      screen.getByRole("button", { name: "Record planned workout" }),
    ).toBeVisible();

    fireEvent.click(
      screen.getByRole("button", { name: /Tuesday, Tempo Run, locked/i }),
    );
    expect(
      screen.getByRole("button", { name: "Jump back to today" }),
    ).toBeVisible();
  });

  it("keeps today’s plan status visible after the plan is completed", () => {
    render(
      <WhatsNext
        {...common}
        planWindow={{
          ...planWindow,
          today: { ...planWindow.today, completed: true },
          days: planWindow.days.map((day) =>
            day.dayIndex === planWindow.today.dayIndex
              ? { ...day, completed: true }
              : day,
          ),
        }}
        restDay={false}
        planComplete
        cooldownComplete={false}
      />,
    );

    expect(
      screen.getByRole("region", { name: "This week’s coach plan" }),
    ).toBeVisible();
    expect(screen.getByText("Today’s workout is in the books.")).toBeVisible();
    expect(screen.getByText("Recommended next")).toBeVisible();
  });

  it("presents one recommendation and clearly typed secondary actions", () => {
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
      screen.getByRole("button", { name: /Review easy recovery walk/i }),
    ).toBeVisible();
    expect(
      screen.getByRole("link", { name: /Open Team lounge/i }),
    ).toHaveAttribute("href", "/team");
    expect(
      screen.getByRole("link", { name: /Log another activity/i }),
    ).toHaveAttribute("href", "/log/additional");
    expect(screen.getByText(/Anything else is optional/i)).toBeInTheDocument();
  });

  it("makes Team lounge the recommendation after cooldown", () => {
    render(
      <WhatsNext {...common} restDay={false} planComplete cooldownComplete />,
    );

    expect(screen.getByText("Recommended next")).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: /Open Team lounge/i }),
    ).toBeVisible();
    expect(screen.getByText("Cooldown logged")).toBeInTheDocument();
  });

  it("counts submitted planned rest as done without suggesting more training", () => {
    render(
      <WhatsNext {...common} restDay planComplete cooldownComplete={false} />,
    );

    expect(screen.getByText("Planned rest logged")).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: /Open Team lounge/i }),
    ).toBeVisible();
    expect(
      screen.queryByRole("link", { name: /Log another activity/i }),
    ).not.toBeInTheDocument();
    expect(screen.getByText(/Rest was today’s plan/i)).toBeInTheDocument();
  });

  it("requires review and explicit confirmation before recording cooldown", () => {
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
      screen.getByRole("button", { name: /Review easy recovery walk/i }),
    );
    expect(onRecordCooldown).not.toHaveBeenCalled();
    expect(screen.getByText(/Nothing has been saved yet/i)).toBeVisible();

    fireEvent.click(
      screen.getByRole("button", { name: /Record easy recovery walk/i }),
    );
    expect(onRecordCooldown).toHaveBeenCalledOnce();
  });

  it("switches to recovery guidance after a difficult check-in", () => {
    render(
      <WhatsNext
        {...common}
        recentTiredness={6}
        restDay={false}
        planComplete
        cooldownComplete={false}
      />,
    );

    expect(
      screen.getByRole("heading", { name: "Recovery first" }),
    ).toBeVisible();
    expect(
      screen.queryByRole("link", { name: /Log another activity/i }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /recovery walk/i }),
    ).not.toBeInTheDocument();
  });

  it("renders preview actions as clearly unavailable status", () => {
    render(
      <WhatsNext
        {...common}
        previewOnly
        restDay={false}
        planComplete
        cooldownComplete={false}
      />,
    );

    expect(
      screen.getByText("Preview only—nothing can be saved."),
    ).toBeVisible();
    expect(
      screen.queryByRole("link", { name: /Log another activity/i }),
    ).not.toBeInTheDocument();
  });
});

function planDay(
  dayIndex: number,
  occursOn: string,
  label: string,
): CurrentTrainingPlanDay {
  return {
    planId: "plan-one",
    dayIndex,
    templateName: "Speed and recovery",
    occursOn,
    kind: "training" as const,
    focus: "speed" as const,
    durationMinutes: 20,
    intensity: "hard" as const,
    completed: false,
    blocks: [
      {
        blockIndex: 0,
        activityDefinitionId: "hill-sprints",
        label,
        durationMinutes: 20,
        completed: false,
      },
    ],
  };
}
