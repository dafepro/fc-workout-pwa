import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { TeamRewardPanel } from "./TeamRewardPanel.dev";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: vi.fn() }),
}));

afterEach(() => vi.unstubAllGlobals());

describe("development team reward panel", () => {
  it("publishes only the predefined reward through structured controls", async () => {
    const calls: { url: string; init: RequestInit }[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string, init: RequestInit = {}) => {
        calls.push({ url, init });
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

    render(<TeamRewardPanel teamId="team-1" />);

    expect(await screen.findByText("Team celebration")).toBeInTheDocument();
    expect(screen.queryByRole("textbox")).not.toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("Starts on"), {
      target: { value: "2026-09-01" },
    });
    fireEvent.change(screen.getByLabelText("Ends on"), {
      target: { value: "2026-09-07" },
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
      startsOn: "2026-09-01",
      endsOn: "2026-09-07",
      requiredDays: 4,
      minimumRosterPercent: 80,
    });
    expect(
      new Headers(published?.init.headers).get("Idempotency-Key"),
    ).toBeTruthy();
  });

  it("shows aggregate progress and can cancel the active reward", async () => {
    let cancelled = false;
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string, init: RequestInit = {}) => {
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

    render(<TeamRewardPanel teamId="team-1" />);
    expect(
      await screen.findByText("2 of 4 qualifying days"),
    ).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Cancel reward" }));
    fireEvent.click(screen.getByRole("button", { name: "Yes, cancel reward" }));
    await screen.findByText("Reward cancelled.");
    expect(cancelled).toBe(true);
  });
});
