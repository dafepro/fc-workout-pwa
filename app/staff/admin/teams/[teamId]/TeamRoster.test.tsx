import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { TeamRoster } from "./TeamRoster";

const replace = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ replace }) }));
vi.mock("next/link", () => ({
  default: ({
    href,
    children,
  }: {
    href: string;
    children: React.ReactNode;
  }) => <a href={href}>{children}</a>,
}));

const team = {
  id: "t1",
  clubId: "c1",
  clubName: "Riverside FC",
  name: "Hill Striders",
  seasonId: "season-2026",
  timeZone: "UTC",
  weeklyGoal: 3,
  playerCount: 2,
};

const emptyRoster = { roster: [] };
const catalog = {
  catalog: [
    {
      key: "hill_sprints_8x6",
      displayName: "Hill Sprints (8x6)",
      activityDefinitionId: "hill-sprints",
      defaultTargetValue: 6,
      defaultTargetUnit: "reps",
    },
  ],
};
const noCurrentAssignments = {
  assignments: [],
  current: { completed: [], oneAway: [], keepGoing: [] },
};

interface Call {
  url: string;
  method: string;
  body: Record<string, unknown> | null;
}

function stubBackend(handler: (call: Call) => Response) {
  const calls: Call[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init: RequestInit = {}) => {
      const call: Call = {
        url,
        method: init.method ?? "GET",
        body: init.body
          ? (JSON.parse(String(init.body)) as Record<string, unknown>)
          : null,
      };
      calls.push(call);
      return handler(call);
    }),
  );
  return calls;
}

function routeFor(call: Call, path: string): boolean {
  return call.url.endsWith(path);
}

beforeEach(() => {
  replace.mockReset();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("coach assignment panel", () => {
  it("creates an assignment from the approved catalog with its default target", async () => {
    const calls = stubBackend((call) => {
      if (routeFor(call, "/assignment-catalog")) return Response.json(catalog);
      if (routeFor(call, "/roster")) return Response.json(emptyRoster);
      if (call.method === "POST" && call.url.endsWith("/assignments"))
        return Response.json({ id: "assignment-1" }, { status: 201 });
      if (call.url.endsWith("/assignments"))
        return Response.json(noCurrentAssignments);
      return Response.json(team);
    });
    render(<TeamRoster teamId="t1" />);

    const select = await screen.findByLabelText("Activity");
    fireEvent.change(select, { target: { value: "hill_sprints_8x6" } });
    expect(screen.getByLabelText("Target")).toHaveValue(6);
    expect(screen.getByLabelText("Unit")).toHaveValue("reps");

    fireEvent.change(screen.getByLabelText("Starts on"), {
      target: { value: "2026-08-10" },
    });
    fireEvent.change(screen.getByLabelText("Due on"), {
      target: { value: "2026-08-16" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Create assignment" }));

    await screen.findByText(/No assignments yet\./);
    const created = calls.find(
      (call) => call.method === "POST" && call.url.endsWith("/assignments"),
    );
    expect(created?.body).toEqual({
      catalogKey: "hill_sprints_8x6",
      targetValue: 6,
      targetUnit: "reps",
      startsOn: "2026-08-10",
      dueOn: "2026-08-16",
    });
  });

  it("groups the live assignment as Completed, One Away, and Keep Going, with no raw values", async () => {
    const current = {
      assignments: [
        {
          id: "assignment-1",
          catalogKey: "hill_sprints_8x6",
          activityName: "Hill Sprints",
          targetValue: 6,
          targetUnit: "reps",
          startsOn: "2026-08-05",
          dueOn: "2026-08-12",
          createdAt: "2026-08-05T00:00:00Z",
        },
      ],
      current: {
        assignment: {
          id: "assignment-1",
          catalogKey: "hill_sprints_8x6",
          activityName: "Hill Sprints",
          targetValue: 6,
          targetUnit: "reps",
          startsOn: "2026-08-05",
          dueOn: "2026-08-12",
          createdAt: "2026-08-05T00:00:00Z",
        },
        completed: [{ playerId: "p1", firstName: "Ada", lastInitial: "B" }],
        oneAway: [{ playerId: "p2", firstName: "Nia", lastInitial: "K" }],
        keepGoing: [{ playerId: "p3", firstName: "Sam", lastInitial: "R" }],
      },
    };
    stubBackend((call) => {
      if (routeFor(call, "/assignment-catalog")) return Response.json(catalog);
      if (routeFor(call, "/roster")) return Response.json(emptyRoster);
      if (call.url.endsWith("/assignments")) return Response.json(current);
      return Response.json(team);
    });
    render(<TeamRoster teamId="t1" />);

    expect(await screen.findByText("Ada B")).toBeInTheDocument();
    expect(screen.getByText("Nia K")).toBeInTheDocument();
    expect(screen.getByText("Sam R")).toBeInTheDocument();
    expect(screen.getByText(/Completed/)).toBeInTheDocument();
    expect(screen.getByText(/One Away/)).toBeInTheDocument();
    expect(screen.getByText(/Keep Going/)).toBeInTheDocument();

    // UX_AND_SAFETY_RULES.md's positive grouping: a coach may see a raw
    // target on their own team, but the group labels themselves must never
    // use a negative word like bottom, behind, failing, worst, or inactive.
    const prohibited = ["bottom", "behind", "failing", "worst", "inactive"];
    const body = document.body.textContent ?? "";
    for (const word of prohibited) {
      expect(body.toLowerCase().includes(word)).toBe(false);
    }
  });
});
