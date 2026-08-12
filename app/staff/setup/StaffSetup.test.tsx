import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { StaffSetup } from "./StaffSetup";

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

function stubBackend({ withoutQr = false }: { withoutQr?: boolean } = {}) {
  const calls: Record<string, unknown>[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (_url: string, init: RequestInit) => {
      const body = JSON.parse(String(init.body)) as Record<string, unknown>;
      calls.push(body);
      if (body.temporaryPassword) {
        return Response.json(
          {
            email: "coach@example.test",
            secret: "JBSWY3DPEHPK3PXP",
            provisioningUri:
              "otpauth://totp/ZoomiGo:coach@example.test?secret=x",
            // Omitted exactly as the service omits it when encoding failed.
            ...(withoutQr ? {} : { qrPngBase64: "aVZCT1J3MEtHZ28=" }),
          },
          { status: 200 },
        );
      }
      return Response.json(
        {
          session: { expiresAt: "z" },
          recoveryCodes: ["aaaa-1111", "bbbb-2222"],
        },
        { status: 201 },
      );
    }),
  );
  return calls;
}

function openWith(suffix: string) {
  window.history.replaceState(null, "", `/staff/setup${suffix}`);
  return render(<StaffSetup />);
}

async function reachEnrollStep({ withoutQr = false } = {}) {
  if (withoutQr) stubBackend({ withoutQr: true });
  openWith("#setup=one-time-setup-token");
  fireEvent.change(await screen.findByLabelText("Temporary password"), {
    target: { value: "handed-over-in-person" },
  });
  fireEvent.submit(screen.getByRole("button", { name: "Continue" }));
  await screen.findByLabelText("New password");
}

function fillEnrollment({
  password,
  confirmation,
  code,
}: {
  password: string;
  confirmation: string;
  code: string;
}) {
  fireEvent.change(screen.getByLabelText("New password"), {
    target: { value: password },
  });
  fireEvent.change(screen.getByLabelText("Repeat new password"), {
    target: { value: confirmation },
  });
  fireEvent.change(screen.getByLabelText("Six-digit code"), {
    target: { value: code },
  });
  fireEvent.submit(screen.getByRole("button", { name: "Finish setup" }));
}

beforeEach(() => {
  replace.mockReset();
  stubBackend();
});

afterEach(() => {
  vi.unstubAllGlobals();
  window.history.replaceState(null, "", "/staff/setup");
});

describe("staff setup", () => {
  it("refuses to start without the one-time link, and asks for nothing", async () => {
    openWith("");

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "This page needs the one-time setup link.",
    );
    expect(screen.queryByLabelText("Temporary password")).toBeNull();
  });

  it("strips the setup token from history before anything is sent", async () => {
    const calls = stubBackend();
    openWith("#setup=one-time-setup-token");

    await screen.findByLabelText("Temporary password");
    await waitFor(() => expect(window.location.hash).toBe(""));
    expect(calls).toHaveLength(0);
  });

  // The query is the old format. Reading it as a fallback would keep minting a
  // reason for a token to reach a server, which is the whole point of the move,
  // so a link in the old shape is refused and has to be reissued.
  it("refuses a token in the query", async () => {
    openWith("?setup=one-time-setup-token");

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "This page needs the one-time setup link.",
    );
    expect(screen.queryByLabelText("Temporary password")).toBeNull();
  });

  it("keeps the rest of the URL while removing the token", async () => {
    openWith("?ref=email#setup=one-time-setup-token");

    await screen.findByLabelText("Temporary password");
    await waitFor(() => expect(window.location.hash).toBe(""));
    expect(window.location.search).toBe("?ref=email");
  });

  // The fragment is the one part of a URL a browser keeps to itself, so a token
  // that has escapes in it must survive being read back out of it.
  it("reads a token that had to be escaped", async () => {
    const calls = stubBackend();
    openWith("#setup=a%2Bb%2Fc%3Dd%26e");

    fireEvent.change(await screen.findByLabelText("Temporary password"), {
      target: { value: "handed-over-in-person" },
    });
    fireEvent.submit(screen.getByRole("button", { name: "Continue" }));

    await waitFor(() => expect(calls).toHaveLength(1));
    expect(calls[0]).toMatchObject({ setupToken: "a+b/c=d&e" });
  });

  it("offers the QR to scan, with the key and URI still reachable behind it", async () => {
    await reachEnrollStep();

    const qr = screen.getByRole("img", { name: "Authenticator setup QR code" });
    expect(qr).toHaveAttribute("src", "data:image/png;base64,aVZCT1J3MEtHZ28=");

    // The fallback is collapsed but present in the document, so a phone that
    // cannot scan is never stranded.
    expect(screen.getByText("JBSWY3DPEHPK3PXP")).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: "Open in your authenticator app" }),
    ).toHaveAttribute(
      "href",
      "otpauth://totp/ZoomiGo:coach@example.test?secret=x",
    );
  });

  it("still enrolls when the server could not encode the QR", async () => {
    await reachEnrollStep({ withoutQr: true });

    expect(
      screen.queryByRole("img", { name: "Authenticator setup QR code" }),
    ).not.toBeInTheDocument();
    expect(screen.getByText("JBSWY3DPEHPK3PXP")).toBeInTheDocument();
  });

  it("rejects a password under twelve characters without sending it", async () => {
    await reachEnrollStep();
    const before = (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls
      .length;

    fillEnrollment({
      password: "short-pass",
      confirmation: "short-pass",
      code: "123456",
    });

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Use at least 12 characters.",
    );
    expect(
      (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls,
    ).toHaveLength(before);
  });

  it("rejects two passwords that do not match", async () => {
    await reachEnrollStep();

    fillEnrollment({
      password: "a-long-enough-password",
      confirmation: "a-long-enough-passwerd",
      code: "123456",
    });

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "The two passwords do not match.",
    );
  });

  it("rejects a code that is not six digits", async () => {
    await reachEnrollStep();

    fillEnrollment({
      password: "a-long-enough-password",
      confirmation: "a-long-enough-password",
      code: "123",
    });

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Enter the six-digit code from your authenticator.",
    );
  });

  it("shows the recovery codes once and holds the console back until they are saved", async () => {
    await reachEnrollStep();

    fillEnrollment({
      password: "a-long-enough-password",
      confirmation: "a-long-enough-password",
      code: "123456",
    });

    await screen.findByRole("heading", { name: "Save your recovery codes" });
    expect(screen.getByText("aaaa-1111")).toBeInTheDocument();
    const proceed = screen.getByRole("button", {
      name: "Continue to the console",
    });
    expect(proceed).toBeDisabled();

    fireEvent.click(screen.getByRole("checkbox"));
    fireEvent.click(proceed);

    expect(replace).toHaveBeenCalledWith("/staff");
  });
});
