import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { TeamRewardsPrototype } from "./TeamRewardsPrototype";
import { prepareRewardImage } from "./reward-image-preparation";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: vi.fn() }),
}));

vi.mock("./reward-image-preparation", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./reward-image-preparation")>()),
  prepareRewardImage: vi.fn(),
}));

describe("staff team rewards prototype", () => {
  beforeEach(() => {
    window.localStorage.clear();
    vi.unstubAllGlobals();
    vi.clearAllMocks();
    vi.mocked(prepareRewardImage).mockResolvedValue(
      "data:image/jpeg;base64,c2FmZQ==",
    );
  });

  it("guides a coach from an empty state to one active reward", () => {
    render(<TeamRewardsPrototype teamId="team-1" />);

    expect(screen.getByText("Prototype data")).toBeInTheDocument();
    fireEvent.click(
      screen.getByRole("button", { name: "Create a team reward" }),
    );

    fireEvent.change(screen.getByLabelText("Prize name"), {
      target: { value: "Pizza after practice" },
    });
    fireEvent.change(screen.getByLabelText("Qualifying team days"), {
      target: { value: "6" },
    });

    expect(screen.getByText("Pizza after practice")).toBeInTheDocument();
    expect(
      screen.getByText(
        "80% of the team logs their recommended workout on 6 team days.",
      ),
    ).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Publish reward" }));

    expect(screen.getByText("Active reward")).toBeInTheDocument();
    expect(screen.getByText("Recent team days")).toBeInTheDocument();
    expect(screen.getAllByText(/needed$/).length).toBeGreaterThan(0);
    expect(
      screen.queryByRole("button", { name: "Create a team reward" }),
    ).not.toBeInTheDocument();
  });

  it("switches to the teammate consistency template", () => {
    render(<TeamRewardsPrototype teamId="team-2" />);
    fireEvent.click(
      screen.getByRole("button", { name: "Create a team reward" }),
    );
    fireEvent.click(
      screen.getByRole("radio", { name: /Teammate consistency/ }),
    );

    expect(screen.getByLabelText("Number of teammates")).toBeInTheDocument();
    expect(screen.getByLabelText("Days per teammate")).toBeInTheDocument();
  });

  it("keeps the editor open while replacing the consistency day count", () => {
    render(<TeamRewardsPrototype teamId="team-2" />);
    fireEvent.click(
      screen.getByRole("button", { name: "Create a team reward" }),
    );
    fireEvent.click(
      screen.getByRole("radio", { name: /Teammate consistency/ }),
    );

    const days = screen.getByLabelText("Days per teammate");
    expect(days).toHaveValue(3);
    fireEvent.change(days, { target: { value: "" } });

    expect(days).toHaveValue(null);
    expect(screen.getByText("Player card preview")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Publish reward" }),
    ).toBeDisabled();

    fireEvent.change(days, { target: { value: "5" } });

    expect(days).toHaveValue(5);
    expect(screen.getByText(/on 5 days/)).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Publish reward" }),
    ).toBeEnabled();
  });

  it("prepares a selected photo before storing its preview", async () => {
    render(<TeamRewardsPrototype teamId="team-2" />);
    fireEvent.click(
      screen.getByRole("button", { name: "Create a team reward" }),
    );
    const photo = new File(["phone-photo"], "pizza.jpg", {
      type: "image/jpeg",
    });

    fireEvent.change(screen.getByLabelText("Prize image (optional)"), {
      target: { files: [photo] },
    });

    await waitFor(() =>
      expect(prepareRewardImage).toHaveBeenCalledWith(photo, 750 * 1024),
    );
    expect(
      await screen.findByLabelText("What does the image show?"),
    ).toBeInTheDocument();
  });

  it("keeps connected image transfers below the edge-safe payload budget", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockImplementation(() =>
        Promise.resolve(
          new Response(JSON.stringify({ items: [] }), {
            status: 200,
            headers: { "Content-Type": "application/json" },
          }),
        ),
      ),
    );
    render(<TeamRewardsPrototype teamId="team-connected" connected />);
    fireEvent.click(
      await screen.findByRole("button", { name: "Create a team reward" }),
    );
    const photo = new File(["phone-photo"], "pizza.jpg", {
      type: "image/jpeg",
    });

    fireEvent.change(screen.getByLabelText("Prize image (optional)"), {
      target: { files: [photo] },
    });

    await waitFor(() =>
      expect(prepareRewardImage).toHaveBeenCalledWith(photo, 750 * 1024),
    );
  });

  it("shows aggregate permanent email failure without recipient or player detail", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            items: [
              {
                id: "reward-one",
                teamId: "team-connected",
                status: "active",
                prizeTitle: "Team picnic",
                prizeDescription: "Celebrate together.",
                startsOn: "2026-08-25",
                rule: {
                  version: 1,
                  kind: "qualifying_team_days",
                  participationScope: "any_approved_workout",
                  requiredDays: 5,
                  minimumRosterPercent: 80,
                },
                progress: {
                  current: 4,
                  target: 5,
                  percent: 80,
                  contributionPercent: 80,
                  started: 4,
                  close: true,
                  achieved: false,
                  units: [],
                },
                notifications: [
                  {
                    kind: "close",
                    status: "failed",
                    recipientCount: 2,
                    sentCount: 1,
                    failedCount: 1,
                  },
                ],
              },
            ],
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        ),
      ),
    );

    render(<TeamRewardsPrototype teamId="team-connected" connected />);

    expect(
      await screen.findByText("Close: failed for 2 staff"),
    ).toBeInTheDocument();
    expect(screen.queryByText(/@|Mason/i)).not.toBeInTheDocument();
  });

  it("cancels without erasing the reward record", () => {
    render(<TeamRewardsPrototype teamId="team-3" />);
    fireEvent.click(
      screen.getByRole("button", { name: "Create a team reward" }),
    );
    fireEvent.click(screen.getByRole("button", { name: "Publish reward" }));
    fireEvent.click(screen.getByRole("button", { name: "Cancel reward" }));
    fireEvent.click(screen.getByRole("button", { name: "Yes, cancel reward" }));

    expect(screen.getByText("Cancelled reward")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Create a team reward" }),
    ).toBeInTheDocument();
  });
});
