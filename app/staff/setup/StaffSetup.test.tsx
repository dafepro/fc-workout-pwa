import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
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

function stubBackend() {
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

function openWithFragment(fragment: string) {
  window.history.replaceState(null, "", `/staff/setup${fragment}`);
  return render(<StaffSetup />);
}

async function reachEnrollStep() {
  openWithFragment("#setup=one-time-setup-token");
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
  cleanup();
  vi.unstubAllGlobals();
  window.history.replaceState(null, "", "/staff/setup");
});

describe("staff setup", () => {
  it("refuses to start without the one-time link, and asks for nothing", async () => {
    openWithFragment("");

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "This page needs the one-time setup link.",
    );
    expect(screen.queryByLabelText("Temporary password")).toBeNull();
  });

  it("strips the setup token from history before anything is sent", async () => {
    const calls = stubBackend();
    openWithFragment("#setup=one-time-setup-token");

    await screen.findByLabelText("Temporary password");
    await waitFor(() => expect(window.location.hash).toBe(""));
    expect(calls).toHaveLength(0);
  });

  it("shows the enrollment key and the otpauth URI as readable text", async () => {
    await reachEnrollStep();

    expect(screen.getByText("JBSWY3DPEHPK3PXP")).toBeInTheDocument();
    expect(
      screen.getByRole("link", {
        name: "otpauth://totp/ZoomiGo:coach@example.test?secret=x",
      }),
    ).toBeInTheDocument();
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
