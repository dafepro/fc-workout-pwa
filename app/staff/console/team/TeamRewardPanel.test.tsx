import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { TeamRewardPanel } from "./TeamRewardPanel";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: vi.fn() }),
}));

afterEach(() => vi.unstubAllGlobals());

describe("team reward panel", () => {
  it("defaults dates and publishes editable reward copy", async () => {
    const calls: { url: string; init: RequestInit }[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string, init: RequestInit = {}) => {
        calls.push({ url, init });
        if (url.endsWith("v1/staff/teams/team-1")) {
          return Response.json({ timeZone: "America/Chicago" });
        }
        if (url.endsWith("team-reward-definitions")) {
          return Response.json({
            definitions: [
              {
                id: "team-celebration-v1",
                version: 1,
                title: "Team celebration",
                description: "Celebrate together at a future team gathering.",
                artworkId: "celebration-stars",
              },
            ],
          });
        }
        if (url.endsWith("/team-reward") && init.method === "GET") {
          return Response.json(
            { error: { code: "not_found", message: "Not found." } },
            { status: 404 },
          );
        }
        return Response.json(
          {
            id: "reward-1",
            title: "Team celebration",
            description: "Celebrate together at a future team gathering.",
            status: "active",
            startsOn: "2026-09-01",
            endsOn: "2026-09-07",
            rule: { requiredDays: 4, minimumRosterPercent: 80 },
            progress: {
              current: 0,
              target: 4,
              percent: 0,
              achieved: false,
              days: [],
            },
          },
          { status: 201 },
        );
      }),
    );

    render(
      <TeamRewardPanel
        teamId="team-1"
        now={new Date("2026-08-30T18:00:00Z")}
      />,
    );

    expect(await screen.findByLabelText("Reward name")).toHaveValue(
      "Team celebration",
    );
    expect(screen.getByLabelText("Description")).toHaveValue(
      "Celebrate together at a future team gathering.",
    );
    expect(screen.getByLabelText("Starts on")).toHaveValue("2026-08-30");
    expect(screen.getByLabelText("Ends on")).toHaveValue("2026-09-05");
    expect(screen.getByLabelText("Reward image (optional)")).toHaveAttribute(
      "accept",
      "image/png,image/jpeg",
    );
    fireEvent.change(screen.getByLabelText("Reward name"), {
      target: { value: "Pizza party" },
    });
    fireEvent.change(screen.getByLabelText("Description"), {
      target: { value: "Celebrate together after practice." },
    });
    fireEvent.change(screen.getByLabelText("Days to earn"), {
      target: { value: "4" },
    });
    fireEvent.change(screen.getByLabelText("Team participation"), {
      target: { value: "80" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Publish reward" }));

    await screen.findByText("Reward published.");
    const published = calls.find(({ init }) => init.method === "POST");
    expect(JSON.parse(String(published?.init.body))).toEqual({
      definitionId: "team-celebration-v1",
      title: "Pizza party",
      description: "Celebrate together after practice.",
      startsOn: "2026-08-30",
      endsOn: "2026-09-05",
      requiredDays: 4,
      minimumRosterPercent: 80,
    });
    expect(
      new Headers(published?.init.headers).get("Idempotency-Key"),
    ).toBeTruthy();
  });

  it("identifies and focuses a missing required date", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string, init: RequestInit = {}) => {
        if (url.endsWith("v1/staff/teams/team-1")) {
          return Response.json({ timeZone: "America/Chicago" });
        }
        if (url.endsWith("team-reward-definitions")) {
          return Response.json({
            definitions: [
              {
                id: "team-celebration-v1",
                version: 1,
                title: "Team celebration",
                description: "Celebrate together at a future team gathering.",
                artworkId: "celebration-stars",
              },
            ],
          });
        }
        if (url.endsWith("/team-reward") && init.method === "GET") {
          return Response.json({}, { status: 404 });
        }
        return Response.json({});
      }),
    );
    render(
      <TeamRewardPanel
        teamId="team-1"
        now={new Date("2026-08-30T18:00:00Z")}
      />,
    );
    const start = await screen.findByLabelText("Starts on");
    fireEvent.change(start, { target: { value: "" } });
    fireEvent.click(screen.getByRole("button", { name: "Publish reward" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Choose a start date.",
    );
    expect(start).toHaveFocus();
  });

  it("shows aggregate progress and can cancel the active reward", async () => {
    let cancelled = false;
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string, init: RequestInit = {}) => {
        if (url.endsWith("v1/staff/teams/team-1")) {
          return Response.json({ timeZone: "America/Chicago" });
        }
        if (url.endsWith("team-reward-definitions")) {
          return Response.json({ definitions: [] });
        }
        if (url.endsWith("/cancel") && init.method === "POST") {
          cancelled = true;
          return Response.json({ status: "cancelled" });
        }
        if (url.endsWith("/team-reward")) {
          return Response.json({
            id: "reward-1",
            title: "Team celebration",
            description: "Celebrate together at a future team gathering.",
            status: "active",
            startsOn: "2026-09-01",
            endsOn: "2026-09-07",
            rule: { requiredDays: 4, minimumRosterPercent: 80 },
            progress: {
              current: 2,
              target: 4,
              percent: 50,
              achieved: false,
              days: [],
            },
          });
        }
        return Response.json({});
      }),
    );

    render(
      <TeamRewardPanel
        teamId="team-1"
        now={new Date("2026-08-30T18:00:00Z")}
      />,
    );
    expect(
      await screen.findByText("2 of 4 qualifying days"),
    ).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Cancel reward" }));
    fireEvent.click(screen.getByRole("button", { name: "Yes, cancel reward" }));
    await screen.findByText("Reward cancelled.");
    expect(cancelled).toBe(true);
  });
});
