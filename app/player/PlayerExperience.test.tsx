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

  it("keeps the complete daily check-in inline and previews Team rewards", () => {
    renderExperience(<ConsolidatedToday />);

    expect(
      screen.queryByRole("img", { name: /Zoomi/ }),
    ).not.toBeInTheDocument();
    expect(
      screen.getByRole("progressbar", {
        name: "Momentum: 68 out of 100",
      }),
    ).toBeInTheDocument();
    expect(screen.getByText("This week")).toBeInTheDocument();
    expect(
      screen.getByText(
        "2 check-ins this week. 1 more reaches your team’s target.",
      ),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: "Hill Sprints" }),
    ).toBeInTheDocument();
    expect(screen.getByTestId("workout-mark")).toBeInTheDocument();
    expect(screen.getByText("Team rewards coming soon")).toBeInTheDocument();
    expect(screen.getByTestId("reward-mark")).toBeInTheDocument();
    expect(
      screen.queryByRole("link", { name: /Team lounge/ }),
    ).not.toBeInTheDocument();
    expect(
      screen.getByText("Team pulse unlocks after today’s check-in."),
    ).toBeInTheDocument();
    expect(screen.queryByText("Ava R.")).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Log today’s plan" }));
    expect(screen.getByRole("slider", { name: "Effort" })).toBeInTheDocument();
    expect(
      screen.getByRole("slider", { name: "Tiredness" }),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Save workout" })).toBeVisible();

    fireEvent.click(screen.getByRole("button", { name: "Save workout" }));
    expect(
      screen.getByText(
        "2 check-ins this week. 1 more reaches your team’s target.",
      ),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: "What’s next?" }),
    ).toBeInTheDocument();
    expect(screen.getByText("Recommended next")).toBeInTheDocument();
    expect(screen.getByText("Easy recovery walk")).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: /Open Team lounge/ }),
    ).toHaveAttribute("href", "/team");
    expect(
      screen.getByRole("heading", { name: "Latest from your team" }),
    ).toBeInTheDocument();
    expect(screen.getByText("Ava R.")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Cheer Ava for Hill Sprints" }),
    ).toBeEnabled();
  });

  it("counts a submitted planned-rest day toward the weekly note", async () => {
    renderExperience(
      <ConsolidatedToday />,
      beginDay(initialTeamCanvasState(), {
        dayKey: initialTeamCanvasState().dayKey,
        dayKind: "rest",
      }),
    );

    expect(
      screen.getByRole("progressbar", {
        name: "Momentum: 68 out of 100",
      }),
    ).toBeInTheDocument();

    fireEvent.click(
      screen.getByRole("button", { name: "Record planned rest" }),
    );

    expect(
      await screen.findByText(
        "You reached your team’s 3-check-in target this week. Nice consistency.",
      ),
    ).toBeInTheDocument();
    expect(screen.getByText("Planned rest logged")).toBeInTheDocument();
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

  it("shows a dev-published reward in the reserved player slot", async () => {
    const reward = publishPrototypeReward(
      {
        ...createPrototypeReward("team-hill-striders"),
        prizeTitle: "Pizza after practice",
      },
      [],
    );
    writePrototypeRewards("team-hill-striders", [reward]);

    renderExperience(<ConsolidatedToday />, initialTeamCanvasState(), true);

    expect(await screen.findByText("Pizza after practice")).toBeInTheDocument();
    expect(
      screen.queryByText("Team rewards coming soon"),
    ).not.toBeInTheDocument();
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
    fireEvent.click(screen.getByLabelText("Show Momentum card"));
    fireEvent.click(screen.getByLabelText("Show rewards preview"));

    expect(
      screen.getByRole("heading", { name: "What’s next?" }),
    ).toBeInTheDocument();
    expect(
      screen.queryByLabelText("Momentum preview is on-a-roll"),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByText("Team rewards coming soon"),
    ).not.toBeInTheDocument();

    fireEvent.change(screen.getByLabelText("Today preview"), {
      target: { value: "rest" },
    });
    fireEvent.click(screen.getByLabelText("Show Momentum card"));
    expect(
      screen.getByText(
        "2 check-ins this week. 1 more reaches your team’s target.",
      ),
    ).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Reset dev controls" }));

    expect(screen.getByLabelText("Momentum is on-a-roll")).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: "Hill Sprints" }),
    ).toBeInTheDocument();
    expect(screen.getByText("Team rewards coming soon")).toBeInTheDocument();
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
