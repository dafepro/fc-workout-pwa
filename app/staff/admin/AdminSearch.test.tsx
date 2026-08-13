import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { AdminSearch } from "./AdminSearch";

vi.mock("next/navigation", () => ({ useRouter: () => ({ replace: vi.fn() }) }));
// Spreads the rest of the props, because a row link carries an aria-label and a
// mock that dropped it would test a different anchor than the one that ships.
vi.mock("next/link", () => ({
  default: ({
    href,
    children,
    ...rest
  }: {
    href: string;
    children: React.ReactNode;
  }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));

const results = {
  players: [
    {
      playerId: "p1",
      firstName: "Ada",
      lastInitial: "B",
      accountId: "a1",
      accountStatus: "active",
      credentialState: "active" as const,
      membershipFrom: "2026-08-01",
    },
  ],
  teams: [
    {
      id: "t1",
      clubId: "c1",
      clubName: "Riverside FC",
      name: "Hill Striders",
      seasonId: "season-2026",
      timeZone: "UTC",
      weeklyGoal: 3,
      playerCount: 11,
    },
  ],
};

function search() {
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => Response.json(results)),
  );
  render(<AdminSearch />);
  fireEvent.change(screen.getByLabelText("Search players and teams"), {
    target: { value: "hill" },
  });
  fireEvent.click(screen.getByRole("button", { name: "Search" }));
}

afterEach(() => vi.unstubAllGlobals());

// Alpha 1.1. The complaint was that a team name in these results did not look
// clickable -- the base reset gives every anchor `color: inherit` and no
// underline, so the one word that navigated read like the words that did not.
describe("the operator's search results", () => {
  it("makes the whole result row the link to its detail page", async () => {
    search();

    const team = await screen.findByRole("link", { name: "Hill Striders" });
    expect(team).toHaveAttribute("href", "/staff/admin/teams/t1");
    // The facts are inside the anchor, so the row is the target rather than the
    // few characters of the name.
    expect(team).toHaveTextContent("Riverside FC");
    expect(team).toHaveTextContent("11 players");

    const player = screen.getByRole("link", { name: "Ada B" });
    expect(player).toHaveAttribute("href", "/staff/admin/players/p1");
    expect(player).toHaveTextContent("active");
  });

  it("marks the name itself as a link rather than leaving it to look like text", async () => {
    search();

    const team = await screen.findByRole("link", { name: "Hill Striders" });
    expect(team).toHaveClass("console-row-link");
    // The class the stylesheet underlines. Asserted here because the affordance
    // is the entire point of the change and nothing else would catch its loss.
    expect(team.querySelector(".console-row-link__name")).toHaveTextContent(
      "Hill Striders",
    );
  });
});
