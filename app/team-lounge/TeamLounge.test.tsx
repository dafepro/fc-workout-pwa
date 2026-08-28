import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { TeamLounge } from "./TeamLounge";

vi.mock("./LocalLoungeCanvas", () => ({
  LocalLoungeCanvas: ({
    player,
    onStateChange,
  }: {
    player: { firstName: string };
    onStateChange(state: string): void;
  }) => (
    <button type="button" onClick={() => onStateChange("error")}>
      {player.firstName}&apos;s interactive lounge canvas
    </button>
  ),
}));

vi.mock("./SharedLoungeCanvas", () => ({
  SharedLoungeCanvas: ({
    onStateChange,
    onPresenceChange,
  }: {
    onStateChange(state: string): void;
    onPresenceChange(count: number): void;
  }) => (
    <button
      type="button"
      onClick={() => {
        onPresenceChange(2);
        onStateChange("ready");
      }}
    >
      Shared weekly lounge
    </button>
  ),
}));

const mason = {
  id: "player-one",
  firstName: "Mason",
  lastInitial: "C.",
  initials: "MC",
  avatarColor: "#6e56cf",
  weeklySessions: 0,
  effortPoints: 0,
  currentStreak: 0,
  consistency: 0,
};

describe("canonical Team Lounge", () => {
  it("mounts the canvas room without a version or alternate-view choice", () => {
    render(<TeamLounge player={mason} unlocked />);

    expect(
      screen.getByRole("region", { name: "Beach Boardwalk Team Lounge" }),
    ).toBeVisible();
    expect(
      screen.getByRole("button", {
        name: "Mason's interactive lounge canvas",
      }),
    ).toBeVisible();
    expect(screen.queryByRole("combobox")).toBeNull();
    expect(screen.queryByRole("status")).toBeNull();
    expect(document.body.textContent).not.toMatch(
      /\bV[12]\b|preview|alternative/i,
    );

    fireEvent.click(
      screen.getByRole("button", {
        name: "Mason's interactive lounge canvas",
      }),
    );
    expect(screen.queryByText(/drag to move/i)).not.toBeInTheDocument();
  });

  it("explains how to unlock the Lounge without mounting an empty canvas", () => {
    render(<TeamLounge player={mason} unlocked={false} />);

    expect(
      screen.getByRole("heading", { name: "Finish today’s workout" }),
    ).toBeVisible();
    expect(
      screen.getByText(/bring your avatar into the Team Lounge/i),
    ).toBeVisible();
    expect(screen.getByRole("link", { name: "Go to Today" })).toHaveAttribute(
      "href",
      "/",
    );
    expect(
      screen.queryByRole("button", {
        name: "Mason's interactive lounge canvas",
      }),
    ).not.toBeInTheDocument();
  });

  it("uses the shared weekly room for a connected player", () => {
    render(
      <TeamLounge
        player={mason}
        unlocked
        connected
        teamID="team-one"
        roster={[mason]}
      />,
    );

    fireEvent.click(
      screen.getByRole("button", { name: "Shared weekly lounge" }),
    );
    expect(screen.getByText("2 here")).toBeVisible();
    expect(screen.queryByText(/drag to move/i)).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", {
        name: "Mason's interactive lounge canvas",
      }),
    ).not.toBeInTheDocument();
  });

  it("remounts a Lounge that reports an error", () => {
    render(<TeamLounge player={mason} unlocked />);
    const canvas = screen.getByRole("button", {
      name: "Mason's interactive lounge canvas",
    });
    fireEvent.click(canvas);
    fireEvent.click(
      screen.getByRole("button", { name: "Try the boardwalk again" }),
    );

    expect(
      screen.getByRole("button", {
        name: "Mason's interactive lounge canvas",
      }),
    ).not.toBe(canvas);
  });
});
