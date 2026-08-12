import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { StaffSignIn } from "./StaffSignIn";

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

interface Reply {
  status: number;
  body: unknown;
}

function stubBackend(reply: (body: Record<string, unknown>) => Reply) {
  const calls: Record<string, unknown>[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (_url: string, init: RequestInit) => {
      const body = JSON.parse(String(init.body)) as Record<string, unknown>;
      calls.push(body);
      const { status, body: response } = reply(body);
      return new Response(JSON.stringify(response), { status });
    }),
  );
  return calls;
}

async function signInWithPassword(email = "coach@example.test") {
  fireEvent.change(screen.getByLabelText("Email address"), {
    target: { value: email },
  });
  fireEvent.change(screen.getByLabelText("Password"), {
    target: { value: "a-long-enough-password" },
  });
  fireEvent.submit(screen.getByRole("button", { name: "Continue" }));
}

beforeEach(() => {
  replace.mockReset();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("staff sign in", () => {
  // A click that beats hydration used to submit the form the browser's own way.
  // The form declares no method, so that was a GET, and a GET serialises the
  // fields it names into the query string: the staff password ended up in the
  // address bar, in history, in the Referer, and in every access log along the
  // way. The markup has to be safe before React is listening.
  it("cannot submit the password through the URL before hydration", () => {
    const markup = renderToStaticMarkup(<StaffSignIn />);

    expect(markup).toMatch(/<form[^>]+method="post"/);
    // Inert until hydration, so a fast click does nothing rather than
    // navigating away from a form that never sent anything.
    expect(markup).toMatch(/<button[^>]+disabled=""/);
  });

  it("names who the page is for and offers no remembered-device control", () => {
    render(<StaffSignIn />);

    expect(
      screen.getByRole("heading", {
        name: "Coach and staff sign in",
        level: 1,
      }),
    ).toBeInTheDocument();
    expect(screen.getByLabelText("Email address")).toBeInTheDocument();
    expect(screen.queryByRole("checkbox")).toBeNull();
    expect(screen.queryByLabelText("Six-digit code")).toBeNull();
  });

  it("moves to a separate code step once the password is accepted", async () => {
    stubBackend(() => ({
      status: 200,
      body: { challenge: "challenge-token", expiresAt: "2026-08-08T00:05:00Z" },
    }));
    render(<StaffSignIn />);

    await signInWithPassword();

    expect(await screen.findByLabelText("Six-digit code")).toBeInTheDocument();
    // The password field is gone, and the heading still names the audience.
    expect(screen.queryByLabelText("Password")).toBeNull();
    expect(
      screen.getByRole("heading", {
        name: "Coach and staff sign in",
        level: 1,
      }),
    ).toBeInTheDocument();
    expect(replace).not.toHaveBeenCalled();
  });

  it("sends the challenge with the code and lands on the console", async () => {
    const calls = stubBackend((body) =>
      body.challenge
        ? { status: 201, body: { role: "platform_admin" } }
        : { status: 200, body: { challenge: "challenge-token" } },
    );
    render(<StaffSignIn />);
    await signInWithPassword();

    fireEvent.change(await screen.findByLabelText("Six-digit code"), {
      target: { value: "123456" },
    });
    fireEvent.submit(screen.getByRole("button", { name: "Sign in" }));

    await waitFor(() => expect(replace).toHaveBeenCalledWith("/staff"));
    expect(calls[1]).toEqual({ challenge: "challenge-token", code: "123456" });
  });

  it("says the same thing whether the email or the password was wrong", async () => {
    const messages: string[] = [];
    for (const email of ["nobody@example.test", "coach@example.test"]) {
      stubBackend(() => ({
        status: 401,
        body: { error: { code: "invalid_login" } },
      }));
      const view = render(<StaffSignIn />);
      await signInWithPassword(email);

      messages.push((await screen.findByRole("alert")).textContent ?? "");
      view.unmount();
      vi.unstubAllGlobals();
    }

    expect(messages[0]).toBe(
      "That did not work. Check the details and try again.",
    );
    expect(messages[1]).toBe(messages[0]);
  });

  it("separates a throttled attempt from a rejected one", async () => {
    stubBackend(() => ({
      status: 429,
      body: { error: { code: "login_temporarily_locked" } },
    }));
    render(<StaffSignIn />);

    await signInWithPassword();

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Too many attempts. Wait a few minutes and try again.",
    );
  });

  it("sends an unfinished account to the setup instructions instead of a code field", async () => {
    stubBackend(() => ({ status: 200, body: { setupRequired: true } }));
    render(<StaffSignIn />);

    await signInWithPassword();

    expect(
      await screen.findByRole("heading", {
        name: "Finish setting up your account",
      }),
    ).toBeInTheDocument();
    expect(screen.queryByLabelText("Six-digit code")).toBeNull();
  });
});
