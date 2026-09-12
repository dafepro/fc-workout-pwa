import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AccountsScreen } from "./AccountsScreen";

vi.mock("next/navigation", () => ({ useRouter: () => ({ replace: vi.fn() }) }));
vi.mock("next/link", () => ({
  default: ({
    href,
    children,
  }: {
    href: string;
    children: React.ReactNode;
  }) => <a href={href}>{children}</a>,
}));

type Call = { url: string; method: string; body: unknown };

function staffBackend() {
  const actions: Call[] = [];
  let confirmed = false;
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init: RequestInit = {}) => {
      const method = init.method ?? "GET";
      const body = init.body ? JSON.parse(String(init.body)) : undefined;
      if (url === "/staff/api/step-up") {
        if (body.challenge) {
          confirmed = true;
          return new Response(null, { status: 204 });
        }
        return Response.json({ challenge: "local-test-challenge" });
      }
      if (method !== "GET") {
        actions.push({ url, method, body });
        if (!confirmed)
          return Response.json(
            { error: { code: "step_up_required" } },
            { status: 401 },
          );
        if (url.endsWith("/accounts"))
          return Response.json(
            {
              accountId: "new-coach",
              email: "new@example.test",
              role: "coach",
              setupUrl: "https://example.test/staff/setup#token=local",
              temporaryPassword: "local-test-password",
              expiresAt: "2099-01-01T00:00:00Z",
            },
            { status: 201 },
          );
        return new Response(null, { status: 204 });
      }
      if (url.endsWith("/accounts"))
        return Response.json({
          staff: [
            {
              accountId: "coach",
              email: "coach@example.test",
              role: "coach",
              status: "active",
              setupComplete: true,
            },
          ],
        });
      if (url.endsWith("/clubs"))
        return Response.json({
          clubs: [
            { id: "club-one", name: "Club one" },
            { id: "club-two", name: "Club two" },
          ],
        });
      return Response.json({
        teams: [
          { id: "team-one", name: "Team one" },
          { id: "team-two", name: "Team two" },
        ],
      });
    }),
  );
  return actions;
}

async function confirmIdentity() {
  await screen.findByRole("heading", { name: "Confirm it is you" });
  fireEvent.change(screen.getByLabelText("Password"), {
    target: { value: "local-test-password" },
  });
  fireEvent.change(screen.getByLabelText("Six-digit code"), {
    target: { value: "123456" },
  });
  fireEvent.submit(screen.getByRole("button", { name: "Confirm" }));
}

afterEach(() => vi.unstubAllGlobals());

describe("staff account step-up intent", () => {
  it("reauthenticates before creating staff and replays the original email, club, and role", async () => {
    const actions = staffBackend();
    render(<AccountsScreen />);
    fireEvent.change(await screen.findByLabelText("Email address"), {
      target: { value: "new@example.test" },
    });
    fireEvent.change(screen.getByLabelText("Club"), {
      target: { value: "club-two" },
    });
    fireEvent.change(screen.getByLabelText("Role"), {
      target: { value: "club_admin" },
    });
    fireEvent.submit(screen.getByRole("button", { name: "Create account" }));
    await screen.findByRole("heading", { name: "Confirm it is you" });
    expect(screen.getByLabelText("Email address")).toHaveValue(
      "new@example.test",
    );
    expect(screen.queryByRole("dialog")).toBeNull();
    await confirmIdentity();
    await screen.findByRole("dialog");
    expect(actions).toHaveLength(2);
    expect(actions[1]).toEqual(actions[0]);
    expect(actions[1].body).toEqual({
      email: "new@example.test",
      clubId: "club-two",
      role: "club_admin",
    });
  });

  it("cancels without creating staff or discarding the filled form", async () => {
    const actions = staffBackend();
    render(<AccountsScreen />);
    fireEvent.change(await screen.findByLabelText("Email address"), {
      target: { value: "new@example.test" },
    });
    fireEvent.submit(screen.getByRole("button", { name: "Create account" }));
    await screen.findByRole("heading", { name: "Confirm it is you" });
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(
      screen.queryByRole("heading", { name: "Confirm it is you" }),
    ).toBeNull();
    expect(screen.getByLabelText("Email address")).toHaveValue(
      "new@example.test",
    );
    expect(actions).toHaveLength(1);
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it.each(["Assign to a team", "Unassign"])(
    "keeps the selected team through %s reauthentication",
    async (label) => {
      const actions = staffBackend();
      render(<AccountsScreen />);
      fireEvent.change(await screen.findByLabelText("Team assignments"), {
        target: { value: "team-two" },
      });
      fireEvent.click(screen.getByRole("button", { name: label }));
      await screen.findByRole("heading", { name: "Confirm it is you" });
      fireEvent.change(screen.getByLabelText("Team assignments"), {
        target: { value: "team-one" },
      });
      await confirmIdentity();
      await waitFor(() => expect(actions).toHaveLength(2));
      expect(actions[1]).toEqual(actions[0]);
      if (label === "Unassign")
        expect(actions[1].url).toMatch(/team-assignments\/team-two$/);
      else expect(actions[1].body).toEqual({ teamId: "team-two" });
    },
  );
});
