import {
  cleanup,
  fireEvent,
  render,
  screen,
  within,
} from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AvatarIdentityProvider } from "../state/avatar-identity-context";
import { TrainingProvider } from "../state/training-context";
import {
  createPrototypeReward,
  publishPrototypeReward,
  writePrototypeRewards,
} from "../data/team-reward-prototype";
import { MomentumAlphaProvider } from "../momentum-alpha/state";
import {
  beginDay,
  initialTeamCanvasState,
  recordPrimary,
} from "../team-canvas/model";
import { TeamCanvasProvider } from "../team-canvas/state";
import { PlayerShell } from "./PlayerShell";
import { PlayerDevConsole } from "./components/PlayerDevConsole";
import { ConsolidatedTeam } from "./components/ConsolidatedTeam";
import {
  connectedTodayPresentation,
  connectedTodayComplete,
  ConsolidatedToday,
} from "./components/ConsolidatedToday";
import { PreviousViews } from "./components/PreviousViews";
import { PlayerDevSettingsProvider } from "./dev/PlayerDevSettings";

const push = vi.fn();

vi.mock("next/navigation", () => ({
  usePathname: () => "/",
  useRouter: () => ({ push, replace: vi.fn() }),
}));

afterEach(cleanup);

beforeEach(() => {
  window.localStorage.clear();
  push.mockClear();
});

function renderExperience(
  children: React.ReactNode,
  initialCanvasState = initialTeamCanvasState(),
  developerControlsEnabled = false,
) {
  return render(
    <AvatarIdentityProvider
      value={{ currentPlayerID: "mason", avatarConfig: {} }}
    >
      <MomentumAlphaProvider>
        <TeamCanvasProvider initialState={initialCanvasState}>
          <PlayerDevSettingsProvider enabled={developerControlsEnabled}>
            {children}
          </PlayerDevSettingsProvider>
        </TeamCanvasProvider>
      </MomentumAlphaProvider>
    </AvatarIdentityProvider>,
  );
}

function renderExperienceWithTraining(
  children: React.ReactNode,
  initialCanvasState = initialTeamCanvasState(),
) {
  return render(
    <AvatarIdentityProvider
      value={{ currentPlayerID: "mason", avatarConfig: {} }}
    >
      <TrainingProvider>
        <MomentumAlphaProvider>
          <TeamCanvasProvider initialState={initialCanvasState}>
            <PlayerDevSettingsProvider enabled={false}>
              {children}
            </PlayerDevSettingsProvider>
          </TeamCanvasProvider>
        </MomentumAlphaProvider>
      </TrainingProvider>
    </AvatarIdentityProvider>,
  );
}

describe("consolidated default player experience", () => {
  it("does not treat a loaded connected canvas as plan completion", () => {
    expect(
      connectedTodayComplete({
        currentPlanDay: { completed: false },
        currentAssignment: { completed: true },
      } as never),
    ).toBe(false);
    expect(
      connectedTodayComplete({
        currentPlanDay: { completed: true },
        currentAssignment: null,
      } as never),
    ).toBe(true);
  });

  it("uses a safe recommendation instead of calling an unscheduled day planned rest", () => {
    const presentation = connectedTodayPresentation(
      {
        currentPlan: null,
        currentPlanDay: null,
        currentAssignment: null,
        todayRecommendation: {
          source: "suggestion",
          explanationKey: "recent_check_in_recovery",
          kind: "training",
          activityDefinitionId: "recovery-walk-jog",
          targetValue: 10,
          targetUnit: "minutes",
          durationMinutes: 10,
          intensity: "easy",
          completed: false,
        },
        activities: [
          {
            id: "recovery-walk-jog",
            name: "Easy recovery walk",
            defaultValue: 10,
            unit: "minutes",
            description: "Move at a relaxed pace.",
            instructions: ["Keep the pace easy."],
          },
        ],
      } as never,
      {
        dateLabel: "Today",
        activity: "Easy recovery walk",
        workload: "10 min · Easy",
        instruction: "Keep the pace easy.",
        goal: "Goal · 10 minutes",
        stretch: "None",
        reasons: [
          "You checked in recently, so today’s option keeps the effort easy.",
        ],
      },
    );

    expect(presentation.source).toBe("recommendation");
    expect(presentation.restDay).toBe(false);
    expect(presentation.plan.activity).toBe("Easy recovery walk");
    expect(presentation.plan.reasons).toEqual([
      "You checked in recently, so today’s option keeps the effort easy.",
    ]);
  });

  it("names a legacy team item as a team default instead of a coach plan", () => {
    const presentation = connectedTodayPresentation(
      {
        currentPlan: null,
        currentPlanDay: null,
        currentAssignment: { id: "legacy" },
        todayRecommendation: {
          source: "team_default",
          explanationKey: "team_default_today",
          kind: "training",
          completed: false,
        },
      } as never,
      {
        dateLabel: "Today",
        activity: "Hill sprints",
        workload: "8 reps · Steady",
        instruction: "Use a safe hill.",
        goal: "Goal · 8 reps",
        stretch: "None",
        reasons: ["This is the current team activity from your coach."],
      },
    );

    expect(presentation.source).toBe("team-default");
  });

  it("uses a persistent Today, Team, and Me navigation", () => {
    renderExperience(
      <PlayerShell>
        <p>Current screen</p>
      </PlayerShell>,
    );

    const navigation = screen.getByRole("navigation", {
      name: "Primary navigation",
    });
    expect(navigation).toBeInTheDocument();
    expect(
      within(navigation).getByRole("link", { name: "Today" }),
    ).toHaveAttribute("href", "/");
    expect(within(navigation).getByText("Team").closest("a")).toHaveAttribute(
      "href",
      "/team",
    );
    expect(
      within(navigation).getByRole("link", { name: "Me" }),
    ).toHaveAttribute("href", "/me");
    expect(screen.queryByText("Leaders")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Record training")).not.toBeInTheDocument();
  });

  it("leads with today, keeps progress compact, and turns completion into closure", () => {
    renderExperience(<ConsolidatedToday />);

    expect(
      screen.queryByRole("img", { name: /Zoomi/ }),
    ).not.toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: /Momentum 68, 5-day check-in streak/ }),
    ).toHaveAttribute("href", "/progress");
    expect(
      screen.getByRole("progressbar", { name: "Momentum 68 out of 100" }),
    ).toBeVisible();
    expect(
      screen.getByRole("heading", { name: "Hill Sprints" }),
    ).toBeInTheDocument();
    expect(screen.getByText("Today")).toBeInTheDocument();
    expect(
      screen.queryByText("Team rewards coming soon"),
    ).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Team lounge/ })).toHaveAttribute(
      "href",
      "/team",
    );
    expect(
      screen.getByRole("link", { name: /View prize boxes/ }),
    ).toHaveAttribute("href", "/prizes");
    expect(
      screen.queryByText("Team pulse unlocks after today’s check-in."),
    ).not.toBeInTheDocument();
    expect(screen.queryByText("Ava R.")).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Start workout" }));
    expect(screen.getByRole("slider", { name: "Effort" })).toBeInTheDocument();
    expect(
      screen.getByRole("slider", { name: "Tiredness" }),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Save workout" })).toBeVisible();

    fireEvent.click(screen.getByRole("button", { name: "Save workout" }));
    expect(screen.getByText("Today complete")).toBeInTheDocument();
    expect(screen.getByText(/workout check-in is saved/)).toBeInTheDocument();
    expect(screen.queryByText("Recommended next")).not.toBeInTheDocument();
    expect(
      screen.queryByRole("heading", { name: "Latest from your team" }),
    ).not.toBeInTheDocument();
  });

  it("records planned rest through a confirmation and closes today", async () => {
    renderExperience(
      <ConsolidatedToday />,
      beginDay(initialTeamCanvasState(), {
        dayKey: initialTeamCanvasState().dayKey,
        dayKind: "rest",
      }),
    );

    expect(
      screen.getByRole("link", { name: /Momentum 68/ }),
    ).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Start recovery day" }));
    expect(screen.getByText(/Confirm when you have checked in/)).toBeVisible();
    fireEvent.click(
      screen.getByRole("button", { name: "Complete recovery check-in" }),
    );

    expect(await screen.findByText("Today complete")).toBeInTheDocument();
    expect(screen.getByText(/Planned recovery logged/)).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /Log additional/ }),
    ).not.toBeInTheDocument();
  });

  it("does not render team data before the daily plan unlocks it", () => {
    renderExperience(<ConsolidatedTeam />);

    expect(screen.getByText("Team rewards coming soon")).toBeInTheDocument();
    expect(screen.getByText("Finish today first")).toBeInTheDocument();
    expect(screen.queryByText("Elena")).not.toBeInTheDocument();
  });

  it("keeps a published reward out of Today’s permanent hierarchy", async () => {
    const reward = publishPrototypeReward(
      {
        ...createPrototypeReward("team-hill-striders"),
        prizeTitle: "Pizza after practice",
      },
      [],
    );
    writePrototypeRewards("team-hill-striders", [reward]);

    renderExperience(<ConsolidatedToday />, initialTeamCanvasState(), true);

    expect(screen.queryByText("Pizza after practice")).not.toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: /View prize boxes/ }),
    ).toHaveAttribute("href", "/prizes");
  });

  it("renders the Team Canvas widget after plan completion", () => {
    const complete = recordPrimary(initialTeamCanvasState(), {
      completion: "goal",
      effort: 4,
      tiredness: 3,
    });
    renderExperience(<ConsolidatedTeam />, complete);

    expect(
      screen.getByLabelText("Hill Striders weekly canvas"),
    ).toBeInTheDocument();
    expect(screen.getByText("Team stamps")).toBeInTheDocument();
    expect(screen.getByTestId("reward-mark")).toBeInTheDocument();
    expect(screen.queryByText("Canvas dev console")).not.toBeInTheDocument();
  });

  it("puts the three-entry Team Pulse on Team and expands to five", async () => {
    const complete = recordPrimary(initialTeamCanvasState(), {
      completion: "goal",
      effort: 4,
      tiredness: 3,
    });
    renderExperienceWithTraining(<ConsolidatedTeam />, complete);

    const pulse = await screen.findByRole("region", {
      name: "Latest from your team",
    });
    expect(within(pulse).getAllByRole("listitem")).toHaveLength(3);

    fireEvent.click(
      within(pulse).getByRole("button", {
        name: "Show more team activity",
      }),
    );
    expect(within(pulse).getAllByRole("listitem")).toHaveLength(5);
  });

  it("makes the Canvas console available only with the dev capability", () => {
    const complete = recordPrimary(initialTeamCanvasState(), {
      completion: "goal",
      effort: 4,
      tiredness: 3,
    });
    renderExperience(<ConsolidatedTeam />, complete, true);

    expect(screen.getByText("Canvas dev console")).toBeInTheDocument();
  });

  it("resets Momentum, Today, lock, and rewards preview controls together", () => {
    renderExperience(
      <>
        <PlayerDevConsole />
        <ConsolidatedToday />
      </>,
      initialTeamCanvasState(),
      true,
    );

    fireEvent.change(screen.getByLabelText("Momentum preview"), {
      target: { value: "on-a-roll" },
    });
    fireEvent.change(screen.getByLabelText("Today preview"), {
      target: { value: "complete" },
    });
    fireEvent.click(screen.getByLabelText("Show Momentum status"));
    fireEvent.click(screen.getByLabelText("Show rewards preview"));

    expect(screen.getByText("Today complete")).toBeInTheDocument();
    expect(
      screen.queryByRole("link", { name: /Momentum/ }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByText("Team rewards coming soon"),
    ).not.toBeInTheDocument();

    fireEvent.click(screen.getByLabelText("Show Momentum status"));
    expect(
      screen.getByRole("link", { name: /Momentum 68/ }),
    ).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Reset dev controls" }));

    expect(
      screen.getByRole("link", { name: /Momentum 68/ }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: "Hill Sprints" }),
    ).toBeInTheDocument();
    expect(
      screen.queryByText("Team rewards coming soon"),
    ).not.toBeInTheDocument();
  });

  it("does not render the ME dev console without the dev capability", () => {
    renderExperience(<PlayerDevConsole />);

    expect(
      screen.queryByText("Experience dev console"),
    ).not.toBeInTheDocument();
  });

  it("keeps all three previous views in Me and returns to the default", () => {
    render(<PreviousViews />);

    expect(
      screen.getByRole("heading", { name: "Previous views" }),
    ).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Classic Alpha/ })).toHaveAttribute(
      "href",
      "/classic-alpha",
    );
    expect(
      screen.getByRole("link", { name: /Momentum Alpha/ }),
    ).toHaveAttribute("href", "/momentum-alpha");
    expect(screen.getByRole("link", { name: /Team Canvas/ })).toHaveAttribute(
      "href",
      "/team-canvas",
    );
  });
});
