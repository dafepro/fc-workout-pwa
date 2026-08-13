import { render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { TeamProgress } from "./TeamProgress";

// useResource sends an expired session back to the door, so it needs a router.
vi.mock("next/navigation", () => ({ useRouter: () => ({ replace: vi.fn() }) }));
vi.mock("next/link", () => ({
  default: ({
    href,
    children,
  }: {
    href: string;
    children: React.ReactNode;
  }) => <a href={href}>{children}</a>,
}));

const progress = {
  team: { id: "t1", name: "Hill Striders", weeklyGoal: 3 },
  weekStart: "2026-08-10",
  weekEnd: "2026-08-16",
  teamSessions: 7,
  membersMeetingGoal: 1,
  currentChallenge: { activityName: "Hill Sprints", completedCount: 2 },
  members: [
    {
      playerId: "p1",
      firstName: "Ada",
      lastInitial: "B",
      weeklySessions: 3,
      effortPoints: 28,
      currentStreak: 4,
      consistencyDays: 9,
      goalStatus: "completed" as const,
      challengeCompleted: true,
    },
    {
      playerId: "p2",
      firstName: "Nia",
      lastInitial: "K",
      weeklySessions: 2,
      effortPoints: 15,
      currentStreak: 1,
      consistencyDays: 4,
      goalStatus: "one_away" as const,
      challengeCompleted: false,
    },
  ],
};

afterEach(() => vi.unstubAllGlobals());

// REQ-516: the review a coach could not do at all before -- the team against
// its goal, and each player's own participation.
describe("team progress", () => {
  it("reports the team against its weekly goal and each player's own week", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => Response.json(progress)),
    );

    render(<TeamProgress teamId="t1" playerHref={(id) => `/staff/${id}`} />);

    expect(
      await screen.findByText("1 of 2 have reached 3 sessions this week"),
    ).toBeInTheDocument();
    expect(screen.getByText("2026-08-10 to 2026-08-16")).toBeInTheDocument();
    expect(
      screen.getByText("7 sessions logged by the team"),
    ).toBeInTheDocument();
    expect(screen.getByText("Hill Sprints · 2 completed")).toBeInTheDocument();

    expect(screen.getByText("Goal met")).toBeInTheDocument();
    expect(screen.getByText("One away")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Ada B" })).toHaveAttribute(
      "href",
      "/staff/p1",
    );
  });

  it("says nothing about assessments, which no team-shaped screen may carry", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => Response.json(progress)),
    );

    const { container } = render(
      <TeamProgress teamId="t1" playerHref={(id) => `/staff/${id}`} />,
    );
    await screen.findByText("1 of 2 have reached 3 sessions this week");

    // REQ-508. Raw participation is allowed here (F-C8); an assessment is not.
    expect(container.textContent).not.toMatch(
      /assessment|sprint time|shuttle/i,
    );
  });
});
