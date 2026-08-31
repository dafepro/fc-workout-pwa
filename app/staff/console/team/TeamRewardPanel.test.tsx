import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { TeamRewardPanel } from "./TeamRewardPanel";
import {
  prepareRewardImage,
  RewardImagePreparationError,
} from "./reward-image-preparation";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: vi.fn() }),
}));

vi.mock("./reward-image-preparation", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./reward-image-preparation")>()),
  prepareRewardImage: vi.fn(),
}));

afterEach(() => {
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

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

  it("previews and uploads the normalized image instead of the oversized source", async () => {
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
                description: "Celebrate together.",
                artworkId: "celebration-stars",
              },
            ],
          });
        }
        if (url.endsWith("/team-reward") && init.method === "GET") {
          return Response.json({}, { status: 404 });
        }
        if (url.endsWith("/reward-media")) {
          return Response.json({ id: "media-1" }, { status: 201 });
        }
        return Response.json(
          {
            id: "reward-1",
            title: "Team celebration",
            description: "Celebrate together.",
            mediaId: "media-1",
            status: "active",
            startsOn: "2026-08-30",
            endsOn: "2026-09-05",
            rule: { requiredDays: 3, minimumRosterPercent: 70 },
            progress: {
              current: 0,
              target: 3,
              percent: 0,
              achieved: false,
              days: [],
            },
          },
          { status: 201 },
        );
      }),
    );
    const dispose = vi.fn();
    const normalized = new File(["normalized"], "phone-photo.jpg", {
      type: "image/jpeg",
    });
    vi.mocked(prepareRewardImage).mockResolvedValue({
      file: normalized,
      previewURL: "blob:normalized-preview",
      dispose,
    });
    render(
      <TeamRewardPanel
        teamId="team-1"
        now={new Date("2026-08-30T18:00:00Z")}
      />,
    );
    const input = await screen.findByLabelText("Reward image (optional)");
    const oversized = new File(
      [new Uint8Array(4 * 1024 * 1024)],
      "phone-photo.png",
      { type: "image/png" },
    );

    fireEvent.change(input, { target: { files: [oversized] } });

    expect(
      await screen.findByRole("img", { name: "Selected reward preview" }),
    ).toHaveAttribute("src", "blob:normalized-preview");
    expect(prepareRewardImage).toHaveBeenCalledWith(oversized);
    expect(input).not.toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: "Publish reward" }));
    await screen.findByText("Reward published.");

    const upload = calls.find(({ url }) => url.endsWith("/reward-media"));
    expect(upload?.init.body).toBeInstanceOf(FormData);
    expect((upload?.init.body as FormData).get("image")).toBe(normalized);
    const publish = calls.find(
      ({ url, init }) => url.endsWith("/team-reward") && init.method === "POST",
    );
    expect(JSON.parse(String(publish?.init.body))).toMatchObject({
      mediaId: "media-1",
    });
    expect(
      await screen.findByRole("img", { name: "Prize for the team" }),
    ).toHaveAttribute("src", expect.stringContaining("variant=thumbnail"));
  });

  it("preserves a specific preparation error and allows another selection", async () => {
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
                description: "Celebrate together.",
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
    vi.mocked(prepareRewardImage).mockRejectedValue(
      new RewardImagePreparationError("too_large"),
    );
    render(<TeamRewardPanel teamId="team-1" />);
    const input = await screen.findByLabelText("Reward image (optional)");

    fireEvent.change(input, {
      target: {
        files: [new File(["large"], "large.jpg", { type: "image/jpeg" })],
      },
    });

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Choose a JPEG or PNG smaller than 12 MB.",
    );
    expect(input).not.toBeDisabled();
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
