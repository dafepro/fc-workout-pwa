import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AppViewSelect } from "../components/AppViewSelect";
import { defaultAvatar } from "../avatar/config";
import { AvatarIdentityProvider } from "../state/avatar-identity-context";
import { TeamCanvasBoard } from "./components/TeamCanvasBoard";
import { TeamCanvasMe } from "./components/TeamCanvasMe";
import { TeamCanvasShell } from "./components/TeamCanvasShell";
import { TeamCanvasToday } from "./components/TeamCanvasToday";
import { initialTeamCanvasState, recordPrimary } from "./model";
import { teamCanvasStamp } from "./catalog";
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
  it("keeps the team lounge visibly locked in navigation before today is complete", () => {
    renderTeamCanvas(
      <TeamCanvasProvider>
        <TeamCanvasShell>
          <p>Today</p>
        </TeamCanvasShell>
      </TeamCanvasProvider>,
    );

    expect(
      screen.getByRole("navigation", { name: "Team Canvas" }),
    ).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Today" })).toHaveAttribute(
      "href",
      "/team-canvas",
    );
    expect(screen.getByText("Team lounge")).toHaveAttribute(
      "aria-disabled",
      "true",
    );
    expect(
      screen.queryByRole("link", { name: "Team lounge" }),
    ).not.toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: "Open Mason’s profile" }),
    ).toHaveAttribute("href", "/team-canvas/me");
  });

  it("opens the team lounge directly from navigation after today is complete", () => {
    const complete = recordPrimary(initialTeamCanvasState(), {
      completion: "goal",
      effort: 4,
      tiredness: 3,
    });
    renderTeamCanvas(
      <TeamCanvasProvider initialState={complete}>
        <TeamCanvasShell>
          <p>Today</p>
        </TeamCanvasShell>
      </TeamCanvasProvider>,
    );

    expect(screen.getByRole("link", { name: "Team lounge" })).toHaveAttribute(
      "href",
      "/team-canvas/team",
    );
  });

  it("links to the shared avatar builder from the Team Canvas Me view", () => {
    renderTeamCanvas(
      <TeamCanvasProvider>
        <TeamCanvasMe />
      </TeamCanvasProvider>,
    );

    expect(
      screen.getByRole("link", { name: "Customize avatar" }),
    ).toHaveAttribute("href", "/me/avatar");
  });

  it("starts with one daily card and one large text-free action", () => {
    renderTeamCanvas(
      <TeamCanvasProvider>
        <TeamCanvasToday />
      </TeamCanvasProvider>,
    );

    expect(
      screen.getByRole("heading", { name: "Hill Sprints" }),
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
    expect(
      screen.getByRole("link", { name: "Open Team lounge" }),
    ).toHaveAttribute("href", "/team-canvas/team");
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

  it("labels newly earned stamps and acknowledges them on deliberate tray interaction", () => {
    const complete = recordPrimary(initialTeamCanvasState(), {
      completion: "reach",
      effort: 4,
      tiredness: 3,
    });
    const viewNew = vi.fn();
    renderTeamCanvas(
      <TeamCanvasProvider initialState={complete}>
        <TeamCanvasBoard
          stampUnlocks={{
            availableCount: 1,
            choices: [teamCanvasStamp("target")],
            newAssetIDs: ["target"],
            status: "ready",
            unlock: vi.fn(),
            viewNew,
          }}
        />
      </TeamCanvasProvider>,
    );

    const target = screen.getByRole("button", {
      name: /Choose Target stamp.*new/i,
    });
    fireEvent.pointerDown(target);
    expect(viewNew).toHaveBeenCalledTimes(1);
  });

  it("updates the current player's lounge avatar when their saved look changes", () => {
    const complete = recordPrimary(initialTeamCanvasState(), {
      completion: "goal",
      effort: 4,
      tiredness: 3,
    });
    const view = render(
      <AvatarIdentityProvider
        value={{ currentPlayerID: "mason", avatarConfig: {} }}
      >
        <TeamCanvasProvider initialState={complete}>
          <TeamCanvasBoard />
        </TeamCanvasProvider>
      </AvatarIdentityProvider>,
    );
    const mason = screen.getByRole("button", { name: /Move Mason/i });
    expect(
      mason.querySelector('.avatar-art__layer--head circle[r="17.5"]'),
    ).toBeInTheDocument();

    view.rerender(
      <AvatarIdentityProvider
        value={{
          currentPlayerID: "mason",
          avatarConfig: { ...defaultAvatar(), head: "person-tall" },
        }}
      >
        <TeamCanvasProvider initialState={complete}>
          <TeamCanvasBoard />
        </TeamCanvasProvider>
      </AvatarIdentityProvider>,
    );

    const updatedMason = screen.getByRole("button", { name: /Move Mason/i });
    expect(
      updatedMason.querySelector('.avatar-art__layer--head ellipse[rx="14.5"]'),
    ).toBeInTheDocument();
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

    const board = screen.getByLabelText("Hill Striders weekly canvas");
    vi.spyOn(board, "getBoundingClientRect").mockReturnValue({
      x: 0,
      y: 0,
      top: 0,
      right: 320,
      bottom: 500,
      left: 0,
      width: 320,
      height: 500,
      toJSON: () => ({}),
    });
    fireEvent.click(screen.getByRole("button", { name: "Larger" }));
    expect(orbit).toHaveStyle({ top: "42.6%", height: "80px" });

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

  it("slides in a trash target while dragging and restores the stamp on delete", () => {
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
    fireEvent.click(
      screen.getAllByRole("button", { name: /Choose .* stamp/ })[0],
    );
    const stamp = screen.getByRole("button", { name: /Edit .* live stamp/ });
    const trash = screen.getByLabelText("Drop here to delete today’s stamp");

    expect(trash).not.toHaveClass("is-visible");
    fireEvent.pointerDown(stamp, {
      pointerId: 1,
      clientX: 100,
      clientY: 100,
    });
    fireEvent.pointerMove(stamp, {
      pointerId: 1,
      clientX: 125,
      clientY: 125,
    });
    expect(trash).toHaveClass("is-visible");

    fireEvent.keyDown(stamp, { key: "Delete" });
    expect(
      screen.queryByRole("button", { name: /Edit .* live stamp/ }),
    ).toBeNull();
    expect(screen.getByText("1 stamp ready")).toBeInTheDocument();
    expect(
      screen.getAllByRole("button", { name: /Choose .* stamp/ }),
    ).toHaveLength(5);
  });

  it("keeps view selection a small profile setting", () => {
    renderTeamCanvas(<AppViewSelect currentView="team-canvas" />);
    expect(screen.getByRole("combobox", { name: "Experience" })).toHaveValue(
      "/team-canvas/me",
    );
  });
});
