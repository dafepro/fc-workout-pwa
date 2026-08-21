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

  it("records Reach with two direct feel tracks, then shows cooldown separately", () => {
    renderTeamCanvas(
      <TeamCanvasProvider>
        <TeamCanvasToday />
      </TeamCanvasProvider>,
    );

    fireEvent.click(
      screen.getByRole("button", { name: "Record today’s plan" }),
    );
    fireEvent.click(screen.getByRole("button", { name: "Reach · 10 reps" }));
    expect(screen.queryByRole("combobox")).toBeNull();
    fireEvent.change(screen.getByRole("slider", { name: "Effort" }), {
      target: { value: "5" },
    });
    fireEvent.change(screen.getByRole("slider", { name: "Tiredness" }), {
      target: { value: "4" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Save workout" }));

    expect(
      screen.getByRole("heading", { name: "Cool down" }),
    ).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Join Team now" })).toHaveAttribute(
      "href",
      "/team-canvas/team",
    );
    expect(push).not.toHaveBeenCalledWith("/team-canvas/team");

    fireEvent.click(screen.getByRole("button", { name: "Record cooldown" }));
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
    const reached = recordPrimary(initialTeamCanvasState(), {
      completion: "reach",
      effort: 5,
      tiredness: 4,
    });
    const complete = {
      ...reached,
      completedDayKeys: ["2026-08-18", "2026-08-19", "2026-08-20"],
    };
    const view = renderTeamCanvas(
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
    expect(screen.getAllByTestId("Mason-star")).toHaveLength(3);
    expect(screen.queryByText(/★\s*3|3 stars/i)).toBeNull();
    expect(
      screen.getAllByRole("button", { name: /Choose .* stamp/ }),
    ).toHaveLength(5);
    expect(
      view.container.querySelectorAll("svg.avatar-art").length,
    ).toBeGreaterThanOrEqual(5);
    expect(
      view.container.querySelector(".tc-stamp--peer-live"),
    ).toBeInTheDocument();
    expect(screen.getByText("Live now")).toBeInTheDocument();
    expect(
      screen.queryByText(/8 reps|10 reps|effort 5|tiredness 4/i),
    ).toBeNull();
  });

  it("creates an owner-editable live piece with circular attached controls", () => {
    const complete = recordPrimary(initialTeamCanvasState(), {
      completion: "reach",
      effort: 5,
      tiredness: 4,
    });
    const view = renderTeamCanvas(
      <TeamCanvasProvider initialState={complete}>
        <TeamCanvasBoard />
      </TeamCanvasProvider>,
    );

    fireEvent.click(
      screen.getAllByRole("button", { name: /Choose .* stamp/ })[0],
    );

    expect(
      view.container.querySelector(".tc-stamp--owned-live"),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /Edit .* live stamp/ }),
    ).toBeInTheDocument();
    const orbit = view.container.querySelector(".tc-stamp-orbit");
    expect(orbit).toBeInTheDocument();
    expect(orbit).toContainElement(
      screen.getByRole("button", { name: "Smaller" }),
    );
    expect(orbit).toContainElement(
      screen.getByRole("button", { name: "Larger" }),
    );
    expect(screen.getByRole("button", { name: "Smaller" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Larger" })).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Rotate left" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Rotate right" }),
    ).toBeInTheDocument();
    expect(
      view.container.querySelector(".tc-orbit-control--rotate-left"),
    ).toBeInTheDocument();
    expect(
      view.container.querySelector(".tc-orbit-control--rotate-right"),
    ).toBeInTheDocument();
    expect(
      view.container.querySelector(".tc-rotation-arrow--left"),
    ).toBeInTheDocument();
    expect(
      view.container.querySelector(".tc-rotation-arrow--right"),
    ).toBeInTheDocument();
    expect(view.container.querySelector(".tc-floating-palette")).toBeNull();
    expect(screen.queryByRole("button", { name: /paste/i })).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "Rotate right" }));
    const liveStamp = screen.getByRole("button", {
      name: /Edit .* live stamp/,
    });
    expect(liveStamp).toHaveStyle({
      transform: "translate(-50%, -50%) rotate(12deg)",
    });
    expect(screen.getByRole("button", { name: "Larger" })).toBeInTheDocument();

    fireEvent.click(liveStamp);
    expect(screen.queryByRole("button", { name: "Smaller" })).toBeNull();
    fireEvent.click(liveStamp);
    expect(screen.getByRole("button", { name: "Smaller" })).toBeInTheDocument();
  });

  it("keeps cooldown controls completely off the team canvas", () => {
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
    expect(screen.queryByText(/cooldown|recovery walk/i)).toBeNull();
  });

  it("keeps view selection a small profile setting", () => {
    renderTeamCanvas(<AppViewSelect currentView="team-canvas" />);
    expect(screen.getByRole("combobox", { name: "App view" })).toHaveValue(
      "/team-canvas/me",
    );
  });
});
