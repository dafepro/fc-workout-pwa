import { render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { LoginEntry } from "./LoginEntry";

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

function openWithFragment(fragment: string) {
  window.history.replaceState(null, "", `/login${fragment}`);
  render(<LoginEntry />);
}

beforeEach(() => {
  replace.mockReset();
});

afterEach(() => {
  window.history.replaceState(null, "", "/login");
});

describe("sign-in entry states", () => {
  it("offers no PIN field and a single staff link when no code was scanned", async () => {
    openWithFragment("");

    await screen.findByRole("heading", {
      name: "Scan your QR code to sign in",
    });
    expect(document.querySelector("input[name='pin']")).toBeNull();
    expect(screen.queryByRole("button", { name: "Sign in" })).toBeNull();
    expect(
      screen.getAllByRole("link", { name: "Coaches and staff sign in" }),
    ).toHaveLength(1);
  });

  it("shows the PIN field only for a scanned credential, and strips it from history", async () => {
    openWithFragment("#credential=example-credential-value");

    const pin = await screen.findByLabelText("Four-digit PIN");
    expect(pin).toHaveAttribute("name", "pin");
    expect(
      document.querySelector("form[data-credential-ready='true']"),
    ).not.toBeNull();
    await waitFor(() => expect(window.location.hash).toBe(""));
  });

  it("says the same thing however sign-in failed", async () => {
    const responses = [401, 404, 422];
    for (const status of responses) {
      vi.stubGlobal(
        "fetch",
        vi.fn(async () => new Response("{}", { status })),
      );
      openWithFragment("#credential=example-credential-value");
      const pin = await screen.findByLabelText("Four-digit PIN");
      const form = pin.closest("form")!;
      (pin as HTMLInputElement).focus();

      const { fireEvent } = await import("@testing-library/react");
      fireEvent.change(pin, { target: { value: "2468" } });
      fireEvent.submit(form);

      const alert = await screen.findByRole("alert");
      expect(alert).toHaveTextContent(
        "That did not work. Ask a parent or coach to reissue your QR code.",
      );
      screen.getByRole("alert").remove();
      document.body.innerHTML = "";
    }
    vi.unstubAllGlobals();
  });
});
