import { render, screen, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { PlayerShell } from "./PlayerShell";

let pathname = "/";

vi.mock("next/navigation", () => ({
  usePathname: () => pathname,
}));

vi.mock("../state/auth-context", () => ({
  useAuth: () => ({
    currentPlayer: {
      id: "player-one",
      firstName: "Mason",
      lastInitial: "C.",
      teamIds: ["team-one"],
      currentStreak: 3,
      longestStreak: 5,
      weeklySessions: 2,
      effortPoints: 20,
      avatarSeed: "MC",
    },
  }),
}));

vi.mock("../components/PlayerAvatar", () => ({
  PlayerAvatar: () => <span data-testid="player-avatar" />,
}));

describe("PlayerShell", () => {
  beforeEach(() => {
    pathname = "/";
  });

  it("offers only Today, Team, and Me in both player navigation regions", () => {
    render(
      <PlayerShell>
        <p>Current screen</p>
      </PlayerShell>,
    );

    const navigations = screen.getAllByRole("navigation", {
      name: "Primary navigation",
    });
    expect(navigations).toHaveLength(2);

    for (const navigation of navigations) {
      const links = within(navigation).getAllByRole("link");
      expect(links.map((link) => link.textContent)).toEqual([
        "⌂Today",
        "●●Team",
        "Me",
      ]);
      expect(links.map((link) => link.getAttribute("href"))).toEqual([
        "/",
        "/team",
        "/me",
      ]);
      expect(within(navigation).queryByText("Leaders")).not.toBeInTheDocument();
      expect(within(navigation).queryByText("Log")).not.toBeInTheDocument();
    }

    expect(
      within(navigations[0]).getByRole("link", { name: "Today" }),
    ).toHaveAttribute("aria-current", "page");
    expect(
      screen.queryByRole("link", { name: "Record training" }),
    ).not.toBeInTheDocument();
  });

  it("does not add a global training action outside Today", () => {
    pathname = "/team";

    render(
      <PlayerShell>
        <p>Team screen</p>
      </PlayerShell>,
    );

    expect(
      screen.queryByRole("link", { name: "Record training" }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("link", { name: "Close training entry" }),
    ).not.toBeInTheDocument();
  });

  it("keeps avatar editing focused and marks Me active", () => {
    pathname = "/me/avatar";

    render(
      <PlayerShell>
        <p>Avatar editor</p>
      </PlayerShell>,
    );

    expect(
      screen.getAllByRole("navigation", { name: "Primary navigation" }),
    ).toHaveLength(1);
    expect(screen.getByRole("link", { name: "Me" })).toHaveAttribute(
      "aria-current",
      "page",
    );
  });
});
