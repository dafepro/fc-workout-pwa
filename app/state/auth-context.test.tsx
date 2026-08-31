import { render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { AuthGate, useAuth } from "./auth-context";

const replace = vi.fn();

vi.mock("next/navigation", () => ({
  usePathname: () => "/",
  useRouter: () => ({ replace }),
}));

vi.mock("../player/PlayerShell", () => ({
  PlayerShell: ({ children }: { children: React.ReactNode }) => children,
}));

vi.mock("./training-context", () => ({
  TrainingProvider: ({ children }: { children: React.ReactNode }) => children,
}));

vi.mock("../../lib/analytics/AnalyticsProvider", () => ({
  AnalyticsProvider: ({ children }: { children: React.ReactNode }) => children,
}));

vi.mock("./avatar-identity-context", () => ({
  AvatarIdentityProvider: ({ children }: { children: React.ReactNode }) =>
    children,
}));

afterEach(() => {
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

describe("connected authentication boundary", () => {
  it.each([
    ["has no player", null],
    [
      "has no active team",
      {
        id: "player-api",
        firstName: "API",
        lastInitial: "P",
        teams: [],
      },
    ],
  ])("fails closed when a successful session %s", async (_label, player) => {
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockImplementation(async () =>
          Response.json({ accountId: "account-api", role: "player", player }),
        ),
    );

    render(
      <AuthGate>
        <ProfileProbe />
      </AuthGate>,
    );

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "ZoomiGo is taking a breather",
    );
    expect(screen.queryByText("Mason C.")).not.toBeInTheDocument();
    expect(screen.queryByText("Hill Striders U12")).not.toBeInTheDocument();
  });

  it("uses only the player and team returned by a valid connected session", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockImplementation(async () =>
        Response.json({
          accountId: "account-api",
          role: "player",
          player: {
            id: "player-api",
            firstName: "API",
            lastInitial: "P",
            teams: [
              {
                id: "team-api",
                name: "API Team",
                timeZone: "America/Chicago",
              },
            ],
          },
        }),
      ),
    );

    render(
      <AuthGate>
        <ProfileProbe />
      </AuthGate>,
    );

    expect(await screen.findByText("API P. API Team")).toBeVisible();
    expect(screen.queryByText(/Mason|Hill Striders/u)).not.toBeInTheDocument();
  });

  it("loads the explicit unhosted prototype only for backend-not-configured", async () => {
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockImplementation(async () =>
          Response.json(
            { error: { code: "backend_not_configured" } },
            { status: 503 },
          ),
        ),
    );

    render(
      <AuthGate>
        <ProfileProbe />
      </AuthGate>,
    );

    expect(await screen.findByText("Mason C. Hill Striders U12")).toBeVisible();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });
});

function ProfileProbe() {
  const { currentPlayer, runtime } = useAuth();
  return (
    <p>
      {currentPlayer.firstName} {currentPlayer.lastInitial}{" "}
      {runtime.currentTeam.name}
    </p>
  );
}
