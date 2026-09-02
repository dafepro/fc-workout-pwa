import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { createPortal } from "react-dom";
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
    settingsContainer,
  }: {
    onStateChange(state: string): void;
    onPresenceChange(count: number): void;
    settingsContainer?: Element | null;
  }) => (
    <>
      {settingsContainer
        ? createPortal(
            <button type="button">Quick-message pack settings</button>,
            settingsContainer,
          )
        : null}
      <button
        type="button"
        onClick={() => {
          onPresenceChange(2);
          onStateChange("ready");
        }}
      >
        Shared weekly lounge
      </button>
      <button type="button" onClick={() => onStateChange("superseded")}>
        Supersede shared lounge
      </button>
      <button type="button" onClick={() => onStateChange("ownership-lost")}>
        Lose shared room ownership
      </button>
    </>
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
    expect(
      screen.getByRole("button", { name: "Enter full screen" }),
    ).toBeVisible();
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

    const settings = screen.getByRole("button", {
      name: "Quick-message pack settings",
    });
    expect(settings.closest(".team-lounge__header-actions")).not.toBeNull();
    expect(settings.closest(".team-lounge__world")).toBeNull();
  });

  it("remounts a Lounge that reports an error", () => {
    render(<TeamLounge player={mason} unlocked />);
    const canvas = screen.getByRole("button", {
      name: "Mason's interactive lounge canvas",
    });
    fireEvent.click(canvas);
    fireEvent.click(screen.getByRole("button", { name: "Reconnect canvas" }));

    expect(
      screen.getByRole("button", {
        name: "Mason's interactive lounge canvas",
      }),
    ).not.toBe(canvas);
  });

  it("stops a superseded shared Lounge without offering a retry", () => {
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
      screen.getByRole("button", { name: "Supersede shared lounge" }),
    );

    expect(screen.getByText(/boardwalk is open in another tab/i)).toBeVisible();
    expect(screen.getByRole("link", { name: "Go to Today" })).toHaveAttribute(
      "href",
      "/",
    );
    expect(
      screen.queryByRole("button", { name: "Shared weekly lounge" }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Reconnect canvas" }),
    ).not.toBeInTheDocument();
  });

  it("automatically remounts once after room ownership moves", async () => {
    render(
      <TeamLounge
        player={mason}
        unlocked
        connected
        teamID="team-one"
        roster={[mason]}
      />,
    );
    const firstRoom = screen.getByRole("button", {
      name: "Shared weekly lounge",
    });

    fireEvent.click(
      screen.getByRole("button", { name: "Lose shared room ownership" }),
    );

    expect(screen.getByText("Setting up the boardwalk…")).toBeVisible();
    await waitFor(() =>
      expect(
        screen.getByRole("button", { name: "Shared weekly lounge" }),
      ).not.toBe(firstRoom),
    );

    fireEvent.click(
      screen.getByRole("button", { name: "Lose shared room ownership" }),
    );
    expect(screen.getByText("Canvas connection error.")).toBeVisible();
    expect(
      screen.getByRole("button", { name: "Reconnect canvas" }),
    ).toBeVisible();
  });
});
