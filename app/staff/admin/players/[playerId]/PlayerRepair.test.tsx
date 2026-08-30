import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { PlayerRepair } from "./PlayerRepair";

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

const player = {
  player: { id: "p1", firstName: "Ada", lastInitial: "B." },
  clubId: "club-1",
  clubName: "Riverside FC",
  memberships: [
    { teamId: "t1", teamName: "Hill Striders", activeFrom: "2026-03-01" },
  ],
  credential: {
    state: "locked",
    issuedAt: "2026-03-01T10:00:00Z",
    lastUsedAt: "2026-08-01T18:00:00Z",
    lockedUntil: "2026-08-08T19:00:00Z",
    failedAttempts: 10,
    activeSessions: 0,
  },
  recentAuthEvents: [
    { occurredAt: "2026-08-08T18:59:00Z", eventType: "sign_in_failed" },
  ],
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

beforeEach(() => {
  replace.mockReset();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("player repair", () => {
  it("shows why the child cannot sign in, and offers unlock only when locked", async () => {
    stubBackend(() => Response.json(player));
    render(<PlayerRepair playerId="p1" />);

    expect(
      await screen.findByRole("heading", { name: "Ada B.", level: 1 }),
    ).toBeInTheDocument();
    expect(screen.getByText("Login locked")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Unlock" })).toBeEnabled();
  });

  it("reveals a reissued PIN and QR once, saying it cannot be shown again", async () => {
    stubBackend((call) =>
      call.method === "POST"
        ? Response.json(
            {
              pin: "4821",
              loginUrl: "https://example.test/login#credential=x",
              qrPngBase64: "aGVsbG8=",
            },
            { status: 201 },
          )
        : Response.json(player),
    );
    render(<PlayerRepair playerId="p1" />);

    fireEvent.click(
      await screen.findByRole("button", { name: "Reissue login" }),
    );
    fireEvent.click(screen.getByRole("button", { name: /Reissue login/ }));

    expect(await screen.findByText("4821")).toBeInTheDocument();
    expect(
      await screen.findByRole("img", { name: "Personal sign-in QR code" }),
    ).toHaveAttribute("src", "data:image/png;base64,aGVsbG8=");
    expect(screen.getByText(/can never be shown again/)).toBeInTheDocument();
  });

  it("asks for a fresh password and code when deactivation needs step-up, then retries it", async () => {
    let deactivateAttempts = 0;
    let stepUpCalls = 0;
    const calls = stubBackend((call) => {
      if (call.url.endsWith("/deactivate")) {
        deactivateAttempts += 1;
        // SEC-3: the first attempt is refused because the session's last full
        // authentication is stale.
        return deactivateAttempts === 1
          ? Response.json(
              { error: { code: "step_up_required" } },
              { status: 401 },
            )
          : new Response(null, { status: 204 });
      }
      if (call.url === "/staff/api/step-up") {
        stepUpCalls += 1;
        return stepUpCalls === 1
          ? Response.json({ challenge: "step-up-challenge" }, { status: 200 })
          : new Response(null, { status: 204 });
      }
      return Response.json(player);
    });
    render(<PlayerRepair playerId="p1" />);

    fireEvent.change(
      await screen.findByLabelText("Type the player's name to confirm"),
      { target: { value: "Ada B." } },
    );
    fireEvent.submit(
      screen.getByRole("button", { name: "Deactivate account" }),
    );

    await screen.findByRole("heading", { name: "Confirm it is you" });
    expect(deactivateAttempts).toBe(1);

    fireEvent.change(screen.getByLabelText("Password"), {
      target: { value: "a-long-enough-password" },
    });
    fireEvent.change(screen.getByLabelText("Six-digit code"), {
      target: { value: "654321" },
    });
    fireEvent.submit(screen.getByRole("button", { name: "Confirm" }));

    await waitFor(() => expect(deactivateAttempts).toBe(2));
    expect(
      await screen.findByText("This account is deactivated."),
    ).toBeInTheDocument();
    // The retry carries the same confirmation the operator already typed.
    const deactivations = calls.filter((call) =>
      call.url.endsWith("/deactivate"),
    );
    expect(deactivations[1].body).toEqual({ confirmName: "Ada B." });
    expect(
      screen.queryByRole("heading", { name: "Confirm it is you" }),
    ).toBeNull();
  });

  it("reports a mismatched confirmation without deactivating anything", async () => {
    stubBackend((call) =>
      call.url.endsWith("/deactivate")
        ? Response.json(
            { error: { code: "confirmation_mismatch" } },
            { status: 422 },
          )
        : Response.json(player),
    );
    render(<PlayerRepair playerId="p1" />);

    fireEvent.change(
      await screen.findByLabelText("Type the player's name to confirm"),
      { target: { value: "Ada C." } },
    );
    fireEvent.submit(
      screen.getByRole("button", { name: "Deactivate account" }),
    );

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "That name does not match. Nothing was changed.",
    );
    expect(screen.queryByText("This account is deactivated.")).toBeNull();
  });
});
