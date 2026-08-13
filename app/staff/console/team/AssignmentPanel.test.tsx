import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AssignmentPanel } from "./AssignmentPanel";

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
    {
      key: "distance_run_2mi",
      displayName: "Distance Run (2 miles)",
      activityDefinitionId: "distance-run",
      defaultTargetValue: 2,
      defaultTargetUnit: "miles",
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
  // REQ-512: the whole catalog is assignable, and REQ-510: it is chosen in the
  // athlete's picker, so a preset carries its target across with it.
  it("creates an assignment from any catalog preset, with that preset's target", async () => {
    const calls = stubBackend((call) => {
      if (routeFor(call, "/assignment-catalog")) return Response.json(catalog);
      if (routeFor(call, "/roster")) return Response.json(emptyRoster);
      if (call.method === "POST" && call.url.endsWith("/assignments"))
        return Response.json({ id: "assignment-1" }, { status: 201 });
      if (call.url.endsWith("/assignments"))
        return Response.json(noCurrentAssignments);
      return Response.json(team);
    });
    render(<AssignmentPanel teamId="t1" />);

    // The picker lands on a choice rather than an empty option, so its target
    // is filled in before the coach touches anything.
    const summary = await screen.findByRole("button", {
      name: /^Selected activity:/,
    });
    expect(summary).toHaveTextContent("Hill Sprints (8x6)");
    expect(screen.getByLabelText("Target")).toHaveValue(6);

    fireEvent.click(summary);
    fireEvent.click(
      screen.getByRole("radio", { name: /^Distance Run \(2 miles\)/ }),
    );
    expect(screen.getByLabelText("Target")).toHaveValue(2);
    expect(screen.getByText("miles")).toBeInTheDocument();

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
      catalogKey: "distance_run_2mi",
      targetValue: 2,
      targetUnit: "miles",
      startsOn: "2026-08-10",
      dueOn: "2026-08-16",
    });
  });

  // REQ-513 and REQ-514: an assignment is a plan, not a permanent record. A
  // coach amends the one they typed wrong, and is offered the verb that works
  // when the one they wanted to delete has already started.
  it("amends an assignment, and offers ending early when deleting is refused", async () => {
    const listed = {
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
      current: { completed: [], oneAway: [], keepGoing: [] },
    };
    const calls = stubBackend((call) => {
      if (routeFor(call, "/assignment-catalog")) return Response.json(catalog);
      if (routeFor(call, "/roster")) return Response.json(emptyRoster);
      if (call.method === "PATCH") return new Response(null, { status: 204 });
      if (call.method === "DELETE")
        return Response.json(
          {
            error: {
              code: "assignment_started",
              message:
                "This assignment has already started or has activity against it. End it early instead.",
            },
          },
          { status: 409 },
        );
      if (call.url.endsWith("/end"))
        return Response.json({ dueOn: "2026-08-11" });
      if (call.url.endsWith("/assignments")) return Response.json(listed);
      return Response.json(team);
    });
    render(<AssignmentPanel teamId="t1" />);

    fireEvent.click(await screen.findByRole("button", { name: "Amend" }));
    fireEvent.change(
      screen.getByLabelText("Due on", { selector: "#amend-due-assignment-1" }),
      {
        target: { value: "2026-08-14" },
      },
    );
    fireEvent.click(screen.getByRole("button", { name: "Save changes" }));

    await screen.findByRole("button", { name: "Amend" });
    const amended = calls.find((call) => call.method === "PATCH");
    expect(amended?.url).toContain("/assignments/assignment-1");
    expect(amended?.body).toEqual({
      targetValue: 6,
      targetUnit: "reps",
      startsOn: "2026-08-05",
      dueOn: "2026-08-14",
    });

    // Deleting something already under way would take a player's own history
    // with it, so the refusal names the action that always works.
    fireEvent.click(screen.getByRole("button", { name: "Delete" }));
    fireEvent.click(screen.getByRole("button", { name: "Delete assignment" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "End it early instead.",
    );

    fireEvent.click(screen.getByRole("button", { name: "End it early" }));
    fireEvent.click(screen.getByRole("button", { name: "End it today" }));
    await screen.findByRole("button", { name: "Amend" });
    expect(calls.some((call) => call.url.endsWith("/end"))).toBe(true);
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
    render(<AssignmentPanel teamId="t1" />);

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
