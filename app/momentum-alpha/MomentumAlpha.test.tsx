import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MomentumAlphaEntry } from "../me/MomentumAlphaEntry";
import { MomentumAlphaShell } from "./components/MomentumAlphaShell";
import { MomentumMe } from "./components/MomentumMe";
import { MomentumTeam } from "./components/MomentumTeam";
import { MomentumToday } from "./components/MomentumToday";
import { initialMomentumState } from "./model";
import { MOMENTUM_ALPHA_STORAGE_KEY, MomentumAlphaProvider } from "./state";

vi.mock("next/navigation", () => ({
  usePathname: () => "/momentum-alpha",
}));

afterEach(cleanup);

beforeEach(() => {
  window.localStorage.clear();
});

function renderToday() {
  return render(
    <MomentumAlphaProvider>
      <MomentumToday />
    </MomentumAlphaProvider>,
  );
}

describe("Momentum Alpha application", () => {
  it("offers one explicit switch from Classic Me", () => {
    render(<MomentumAlphaEntry />);

    expect(
      screen.getByRole("heading", { name: "Try Momentum Alpha" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: "Switch to Momentum Alpha" }),
    ).toHaveAttribute("href", "/momentum-alpha");
  });

  it("uses a separate three-destination player shell", () => {
    render(
      <MomentumAlphaProvider>
        <MomentumAlphaShell>
          <p>Alternate application</p>
        </MomentumAlphaShell>
      </MomentumAlphaProvider>,
    );

    const navigation = screen.getByRole("navigation", {
      name: "Momentum Alpha navigation",
    });
    expect(navigation).toHaveTextContent("Today");
    expect(navigation).toHaveTextContent("Team");
    expect(navigation).toHaveTextContent("Me");
    expect(navigation).not.toHaveTextContent("Leaders");
    expect(navigation).not.toHaveTextContent("Log");
  });

  it("makes one personalized daily action and ongoing Momentum obvious", () => {
    renderToday();

    expect(
      screen.getByRole("img", { name: /Personal Momentum is rolling/i }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: "Today’s plan" }),
    ).toBeInTheDocument();
    expect(screen.getByText("Goal · 8 reps")).toBeInTheDocument();
    expect(screen.getByText("Stretch · 10 reps")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Check in" }),
    ).toBeInTheDocument();
  });

  it("completes the goal, promotes recovery, and saves isolated mock state", () => {
    renderToday();

    fireEvent.click(screen.getByRole("button", { name: "Check in" }));
    fireEvent.click(screen.getByRole("button", { name: "Goal · 8 reps" }));
    fireEvent.click(screen.getByRole("button", { name: "Tired" }));
    fireEvent.click(screen.getByRole("button", { name: "Save check-in" }));

    expect(
      screen.getByRole("heading", { name: "Main work complete" }),
    ).toBeInTheDocument();
    expect(screen.getByText("Easy recovery walk")).toBeInTheDocument();
    expect(screen.queryByRole("textbox")).toBeNull();
    expect(document.querySelector('input[type="file"]')).toBeNull();
    expect(window.localStorage.getItem(MOMENTUM_ALPHA_STORAGE_KEY)).toContain(
      '"primaryComplete":true',
    );
    expect(window.localStorage.getItem("zoomigo-milestone-1")).toBeNull();
  });

  it("keeps alternatives inside Today and explains their effect first", () => {
    renderToday();

    fireEvent.click(
      screen.getByRole("button", { name: "Choose another activity" }),
    );
    expect(screen.getByText("Partial Momentum")).toBeInTheDocument();
    fireEvent.click(
      screen.getByRole("button", { name: /Ball control circuit/ }),
    );

    expect(
      screen.getByRole("heading", { name: "What did you complete?" }),
    ).toBeInTheDocument();
    expect(screen.getByText("Goal · 12 minutes")).toBeInTheDocument();
  });

  it("records planned rest with one structured tap and no training prompt", () => {
    render(
      <MomentumAlphaProvider
        initialState={{ ...initialMomentumState(), dayKind: "rest" }}
      >
        <MomentumToday />
      </MomentumAlphaProvider>,
    );

    fireEvent.click(screen.getByRole("button", { name: "Record rest day" }));

    expect(
      screen.getByRole("heading", { name: "Rest recorded" }),
    ).toBeInTheDocument();
    expect(screen.queryByRole("textbox")).toBeNull();
    expect(document.querySelector('input[type="file"]')).toBeNull();
    expect(screen.queryByText(/reps|minutes|miles/i)).toBeNull();
    expect(screen.queryByRole("button", { name: "Check in" })).toBeNull();
  });

  it("shows Team Momentum without a leaderboard or raw results", () => {
    render(
      <MomentumAlphaProvider>
        <MomentumTeam />
      </MomentumAlphaProvider>,
    );

    expect(
      screen.getByRole("heading", { name: "Hill Striders Momentum" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("img", { name: /Team Momentum is building/i }),
    ).toBeInTheDocument();
    expect(screen.getByText("Steady strides")).toBeInTheDocument();
    expect(screen.queryByText(/rank|1st|podium|8 reps|10 reps/i)).toBeNull();
  });

  it("keeps the return switch and private history in Momentum Me", () => {
    render(
      <MomentumAlphaProvider>
        <MomentumMe />
      </MomentumAlphaProvider>,
    );

    expect(
      screen.getByRole("link", { name: "Return to Classic Alpha" }),
    ).toHaveAttribute("href", "/me");
    expect(
      screen.getByRole("heading", { name: "Private activity" }),
    ).toBeInTheDocument();
  });
});
