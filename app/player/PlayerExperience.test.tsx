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
import { ConsolidatedTeam } from "./components/ConsolidatedTeam";
import { ConsolidatedToday } from "./components/ConsolidatedToday";
import { PreviousViews } from "./components/PreviousViews";

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
) {
  return render(
    <AvatarIdentityProvider
      value={{ currentPlayerID: "mason", avatarConfig: {} }}
    >
      <MomentumAlphaProvider>
        <TeamCanvasProvider initialState={initialCanvasState}>
          {children}
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
      screen.getByRole("heading", { name: "Hill sprints" }),
    ).toBeInTheDocument();
    expect(screen.getByText("Team rewards coming soon")).toBeInTheDocument();
    expect(
      screen.getByText("Complete today’s plan to join your team."),
    ).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Log today’s plan" }));
    expect(screen.getByRole("slider", { name: "Effort" })).toBeInTheDocument();
    expect(
      screen.getByRole("slider", { name: "Tiredness" }),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Save workout" })).toBeVisible();
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
      screen.queryByText("Developer canvas toolbox"),
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
