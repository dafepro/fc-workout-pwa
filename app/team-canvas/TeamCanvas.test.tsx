import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AppViewSelect } from "../components/AppViewSelect";
import { AvatarIdentityProvider } from "../state/avatar-identity-context";
import { TeamCanvasBoard } from "./components/TeamCanvasBoard";
import { TeamCanvasShell } from "./components/TeamCanvasShell";
import { TeamCanvasToday } from "./components/TeamCanvasToday";
import { initialTeamCanvasState, recordPrimary } from "./model";
import { TeamCanvasProvider } from "./state";

const push = vi.fn();
const replace = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push, replace }),
}));

afterEach(cleanup);

beforeEach(() => {
  window.localStorage.clear();
  push.mockClear();
  replace.mockClear();
});

function renderTeamCanvas(children: React.ReactNode) {
  return render(
    <AvatarIdentityProvider
      value={{ currentPlayerID: "mason", avatarConfig: {} }}
    >
      {children}
    </AvatarIdentityProvider>,
  );
}

describe("Team Canvas application", () => {
  it("uses an avatar-only profile entrance and no navigation", () => {
    renderTeamCanvas(
      <TeamCanvasProvider>
        <TeamCanvasShell>
          <p>Today</p>
        </TeamCanvasShell>
      </TeamCanvasProvider>,
    );

    expect(screen.queryByRole("navigation")).toBeNull();
    expect(
      screen.getByRole("link", { name: "Open Mason’s profile" }),
    ).toHaveAttribute("href", "/team-canvas/me");
  });

  it("starts with one daily card and one large text-free action", () => {
    renderTeamCanvas(
      <TeamCanvasProvider>
        <TeamCanvasToday />
      </TeamCanvasProvider>,
    );

    expect(
      screen.getByRole("heading", { name: "Hill sprints" }),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/Sprint for 6 seconds, then walk back fully/i),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Record today’s plan" }),
    ).toHaveTextContent("+");
    expect(screen.queryByText("Team")).toBeNull();
  });

  it("records Reach inside the card and opens the team canvas", () => {
    renderTeamCanvas(
      <TeamCanvasProvider>
        <TeamCanvasToday />
      </TeamCanvasProvider>,
    );

    fireEvent.click(
      screen.getByRole("button", { name: "Record today’s plan" }),
    );
    fireEvent.click(screen.getByRole("button", { name: "Reach · 10 reps" }));
    fireEvent.change(screen.getByLabelText("Effort"), {
      target: { value: "5" },
    });
    fireEvent.change(screen.getByLabelText("Tiredness"), {
      target: { value: "4" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Save and join Team" }));

    expect(push).toHaveBeenCalledWith("/team-canvas/team");
  });

  it("renders no teammate data at a locked direct team URL", () => {
    renderTeamCanvas(
      <TeamCanvasProvider>
        <TeamCanvasBoard />
      </TeamCanvasProvider>,
    );

    expect(
      screen.getByRole("heading", { name: "Finish today first" }),
    ).toBeInTheDocument();
    expect(screen.queryByText("Ari")).toBeNull();
    expect(screen.queryByLabelText("Hill Striders weekly canvas")).toBeNull();
  });

  it("shows completers, weekly stars, and five stamp choices after Reach", () => {
    const complete = recordPrimary(initialTeamCanvasState(), {
      completion: "reach",
      effort: 5,
      tiredness: 4,
    });
    renderTeamCanvas(
      <TeamCanvasProvider initialState={complete}>
        <TeamCanvasBoard />
      </TeamCanvasProvider>,
    );

    expect(
      screen.getByLabelText("Hill Striders weekly canvas"),
    ).toBeInTheDocument();
    expect(
      screen.getByText("Ari", { selector: ".tc-player-name" }),
    ).toBeInTheDocument();
    expect(
      screen.getByLabelText("Mason has 1 star this week"),
    ).toBeInTheDocument();
    expect(
      screen.getAllByRole("button", { name: /Choose .* stamp/ }),
    ).toHaveLength(5);
    expect(
      screen.queryByText(/8 reps|10 reps|effort 5|tiredness 4/i),
    ).toBeNull();
  });

  it("adds a second reward through a compact cooldown follow-up", () => {
    const complete = recordPrimary(initialTeamCanvasState(), {
      completion: "reach",
      effort: 5,
      tiredness: 4,
    });
    renderTeamCanvas(
      <TeamCanvasProvider initialState={complete}>
        <TeamCanvasBoard />
      </TeamCanvasProvider>,
    );

    expect(screen.getByText("1 stamp ready")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Record cooldown" }));
    expect(
      screen.getByText("Easy recovery walk · 10 minutes"),
    ).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Save cooldown" }));
    expect(screen.getByText("2 stamps ready")).toBeInTheDocument();
  });

  it("keeps view selection a small profile setting", () => {
    renderTeamCanvas(<AppViewSelect currentView="team-canvas" />);
    expect(screen.getByRole("combobox", { name: "App view" })).toHaveValue(
      "/team-canvas/me",
    );
  });
});
