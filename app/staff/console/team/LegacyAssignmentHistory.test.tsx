import { render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { LegacyAssignmentHistory } from "./LegacyAssignmentHistory";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: vi.fn() }),
}));

afterEach(() => vi.unstubAllGlobals());

it("keeps old assignments readable without offering a second scheduling form", async () => {
  vi.stubGlobal(
    "fetch",
    vi.fn(async () =>
      Response.json({
        assignments: [
          {
            id: "legacy-one",
            catalogKey: "hill_sprints_8x6",
            activityName: "Hill sprints",
            targetValue: 8,
            targetUnit: "reps",
            startsOn: "2026-08-20",
            dueOn: "2026-08-26",
            createdAt: "2026-08-19T12:00:00Z",
          },
        ],
      }),
    ),
  );

  render(<LegacyAssignmentHistory teamId="team-one" />);

  expect(await screen.findByText("Legacy assignment history")).toBeVisible();
  expect(screen.getByText("Hill sprints")).toBeInTheDocument();
  expect(
    screen.queryByRole("button", { name: /Create assignment/i }),
  ).not.toBeInTheDocument();
});
