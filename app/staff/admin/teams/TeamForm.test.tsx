import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { TeamForm } from "./TeamForm";
import type { ClubSummary, TeamSummary } from "../../console/types";

const clubs: ClubSummary[] = [
  { id: "club-1", name: "Riverside FC", teamCount: 1, createdAt: "2026-01-01" },
];

const team: TeamSummary = {
  id: "t1",
  clubId: "club-1",
  clubName: "Riverside FC",
  name: "Hill Striders",
  seasonId: "2026-autumn",
  timeZone: "America/New_York",
  weeklyGoal: 3,
  playerCount: 12,
};

interface Call {
  url: string;
  method: string;
  body: Record<string, unknown> | null;
}

function stubBackend() {
  const calls: Call[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init: RequestInit = {}) => {
      calls.push({
        url,
        method: init.method ?? "GET",
        body: init.body
          ? (JSON.parse(String(init.body)) as Record<string, unknown>)
          : null,
      });
      return Response.json(team, { status: 200 });
    }),
  );
  return calls;
}

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("team form", () => {
  it("offers time zones as a validated list and the weekly goal as 1 to 7", () => {
    render(<TeamForm clubs={clubs} onSaved={vi.fn()} />);

    const zone = screen.getByLabelText("Time zone");
    expect(zone.tagName).toBe("SELECT");
    const goal = screen.getByLabelText("Weekly goal (sessions)");
    const options = [...(goal as unknown as HTMLSelectElement).options];
    expect(options.map((option) => option.value)).toEqual([
      "1",
      "2",
      "3",
      "4",
      "5",
      "6",
      "7",
    ]);
  });

  it("creates a team from the chosen values", async () => {
    const calls = stubBackend();
    const onSaved = vi.fn();
    render(<TeamForm clubs={clubs} onSaved={onSaved} />);

    fireEvent.change(screen.getByLabelText("Team name"), {
      target: { value: "Hill Striders" },
    });
    fireEvent.change(screen.getByLabelText("Season"), {
      target: { value: "2026-autumn" },
    });
    fireEvent.change(screen.getByLabelText("Time zone"), {
      target: { value: "Europe/London" },
    });
    fireEvent.change(screen.getByLabelText("Weekly goal (sessions)"), {
      target: { value: "5" },
    });
    fireEvent.submit(screen.getByRole("button", { name: "Create team" }));

    await waitFor(() => expect(onSaved).toHaveBeenCalled());
    expect(calls[0].method).toBe("POST");
    expect(calls[0].url).toBe("/staff/api/backend/v1/staff/teams");
    expect(calls[0].body).toEqual({
      clubId: "club-1",
      name: "Hill Striders",
      seasonId: "2026-autumn",
      timeZone: "Europe/London",
      weeklyGoal: 5,
    });
  });

  it("saves an edit that leaves the time zone alone without a warning", async () => {
    const calls = stubBackend();
    render(<TeamForm clubs={clubs} team={team} onSaved={vi.fn()} />);

    fireEvent.change(screen.getByLabelText("Team name"), {
      target: { value: "Hill Striders A" },
    });
    fireEvent.submit(screen.getByRole("button", { name: "Save team" }));

    await waitFor(() => expect(calls).toHaveLength(1));
    expect(calls[0].method).toBe("PUT");
    expect(screen.queryByRole("alert")).toBeNull();
  });

  // REQ-604: the time zone decides what "today" is, so the first attempt at
  // changing it explains the consequence instead of saving.
  it("refuses the first save of a time-zone change and explains what it alters", async () => {
    const calls = stubBackend();
    render(<TeamForm clubs={clubs} team={team} onSaved={vi.fn()} />);

    fireEvent.change(screen.getByLabelText("Time zone"), {
      target: { value: "Europe/London" },
    });
    fireEvent.submit(screen.getByRole("button", { name: "Save team" }));

    const warning = await screen.findByRole("alert");
    expect(warning).toHaveTextContent(
      /Changing the time zone from America\/New_York to Europe\/London/,
    );
    expect(warning).toHaveTextContent(/24-hour window/);
    expect(calls).toHaveLength(0);
  });

  it("saves the time-zone change once it has been confirmed", async () => {
    const calls = stubBackend();
    const onSaved = vi.fn();
    render(<TeamForm clubs={clubs} team={team} onSaved={onSaved} />);

    fireEvent.change(screen.getByLabelText("Time zone"), {
      target: { value: "Europe/London" },
    });
    fireEvent.submit(screen.getByRole("button", { name: "Save team" }));

    fireEvent.submit(
      await screen.findByRole("button", {
        name: "Save the time-zone change",
      }),
    );

    await waitFor(() => expect(onSaved).toHaveBeenCalled());
    expect(calls[0].method).toBe("PUT");
    expect(calls[0].url).toBe("/staff/api/backend/v1/staff/teams/t1");
    expect(calls[0].body).toMatchObject({ timeZone: "Europe/London" });
  });

  it("asks again if the zone is changed a second time before saving", async () => {
    const calls = stubBackend();
    render(<TeamForm clubs={clubs} team={team} onSaved={vi.fn()} />);

    fireEvent.change(screen.getByLabelText("Time zone"), {
      target: { value: "Europe/London" },
    });
    fireEvent.submit(screen.getByRole("button", { name: "Save team" }));
    await screen.findByRole("alert");

    fireEvent.change(screen.getByLabelText("Time zone"), {
      target: { value: "Europe/Paris" },
    });

    expect(screen.queryByRole("alert")).toBeNull();
    expect(
      screen.getByRole("button", { name: "Save team" }),
    ).toBeInTheDocument();
    expect(calls).toHaveLength(0);
  });
});
