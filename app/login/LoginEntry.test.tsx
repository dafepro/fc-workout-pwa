import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
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

function openWithFragment(fragment: string, devAccess = false) {
  window.history.replaceState(null, "", `/login${fragment}`);
  render(<LoginEntry devAccess={devAccess} />);
}

beforeEach(() => {
  replace.mockReset();
});

afterEach(() => {
  window.history.replaceState(null, "", "/login");
});

describe("sign-in entry states", () => {
  // Wait on the staff link, not the heading: the heading renders while the
  // fragment is still being read, so it settles nothing. The link is the first
  // thing that proves the scan state was reached.
  it("offers no PIN field and a single staff link when no code was scanned", async () => {
    openWithFragment("");

    expect(
      await screen.findAllByRole("link", { name: "Coaches and staff sign in" }),
    ).toHaveLength(1);
    expect(
      screen.getByRole("heading", { name: "Scan your QR code to sign in" }),
    ).toBeInTheDocument();
    expect(document.querySelector("input[name='pin']")).toBeNull();
    expect(screen.queryByRole("button", { name: "Sign in" })).toBeNull();
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

  it("sends an unscanned dev visitor to the preview account directory", async () => {
    openWithFragment("", true);

    await waitFor(() => expect(replace).toHaveBeenCalledWith("/dev-access"));
    expect(
      screen.queryByRole("heading", { name: "Scan your QR code to sign in" }),
    ).not.toBeInTheDocument();
  });

  it("keeps a scanned dev credential on the player PIN form", async () => {
    openWithFragment("#credential=example-credential-value", true);

    expect(await screen.findByLabelText("Four-digit PIN")).toBeInTheDocument();
    expect(replace).not.toHaveBeenCalledWith("/dev-access");
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

      fireEvent.change(pin, { target: { value: "2468" } });
      fireEvent.submit(form);

      expect(await screen.findByRole("alert")).toHaveTextContent(
        "That did not work. Ask a parent or coach to reissue your QR code.",
      );
      // Three renders inside one test, so this one unmounts its own.
      cleanup();
    }
    vi.unstubAllGlobals();
  });
});
