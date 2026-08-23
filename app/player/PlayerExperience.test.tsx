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
import { MomentumAlphaProvider } from "../momentum-alpha/state";
import { initialTeamCanvasState, recordPrimary } from "../team-canvas/model";
import { TeamCanvasProvider } from "../team-canvas/state";
import { PlayerShell } from "./PlayerShell";
import { PlayerDevConsole } from "./components/PlayerDevConsole";
import { ConsolidatedTeam } from "./components/ConsolidatedTeam";
import { ConsolidatedToday } from "./components/ConsolidatedToday";
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
      screen.getByRole("img", { name: "Zoomi runs with your Momentum" }),
    ).toHaveAttribute("src", "/art/zoomi/zoomi-momentum-v2.webp");
    expect(
      screen.getByRole("progressbar", { name: "Momentum path: Rolling" }),
    ).toBeInTheDocument();
    expect(screen.getByText("Today’s best move")).toBeInTheDocument();
    expect(
      screen.getByText("Aim for the goal. Stretch stays optional."),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: "Hill sprints" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("img", { name: "Zoomi charges up the hill" }),
    ).toHaveAttribute("src", "/art/zoomi/zoomi-workout.webp");
    expect(screen.getByText("Team rewards coming soon")).toBeInTheDocument();
    expect(
      screen.getByRole("img", { name: "Zoomi guards a mystery team reward" }),
    ).toHaveAttribute("src", "/art/zoomi/zoomi-rewards.webp");
    expect(
      screen.getByText("Complete today’s plan to join your team."),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("img", { name: "Zoomi opens the Team lounge" }),
    ).toHaveAttribute("src", "/art/zoomi/zoomi-lounge.webp");

    fireEvent.click(screen.getByRole("button", { name: "Log today’s plan" }));
    expect(screen.getByRole("slider", { name: "Effort" })).toBeInTheDocument();
    expect(
      screen.getByRole("slider", { name: "Tiredness" }),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Save workout" })).toBeVisible();

    fireEvent.click(screen.getByRole("button", { name: "Save workout" }));
    expect(
      screen.getByText("Hard work is done. Keep the next move easy."),
    ).toBeInTheDocument();
  });

  it("does not render team data before the daily plan unlocks it", () => {
    renderExperience(<ConsolidatedTeam />);

    expect(screen.getByText("Team rewards coming soon")).toBeInTheDocument();
    expect(screen.getByText("Finish today first")).toBeInTheDocument();
    expect(screen.queryByText("Elena")).not.toBeInTheDocument();
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
    expect(
      screen.getByRole("img", { name: "Zoomi guards a mystery team reward" }),
    ).toBeInTheDocument();
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
      target: { value: "strong" },
    });
    fireEvent.change(screen.getByLabelText("Today preview"), {
      target: { value: "complete" },
    });
    fireEvent.click(screen.getByLabelText("Show Momentum card"));
    fireEvent.click(screen.getByLabelText("Show rewards preview"));

    expect(screen.getByText("Today is in the books")).toBeInTheDocument();
    expect(
      screen.queryByLabelText("Momentum is strong"),
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
        "Protect today’s recovery. Rest keeps your rhythm steady.",
      ),
    ).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Reset dev controls" }));

    expect(screen.getByLabelText("Momentum is rolling")).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: "Hill sprints" }),
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
