import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { CredentialRevealPanel, InvitationPanel } from "./RevealOnce";
import type { CredentialReveal, StaffInvitation } from "./types";

const reveal: CredentialReveal = {
  playerId: "p1",
  pin: "048213",
  loginUrl:
    "https://zoomigo.quicktrack.cc/login#credential=7f3a9c2b-4d81-4e6a-9f10",
  qrPngBase64: "aGk=",
};

const invitation: StaffInvitation = {
  accountId: "a1",
  email: "coach@example.test",
  role: "coach",
  setupUrl: "https://zoomigo.quicktrack.cc/staff/setup#token=abc123",
  setupToken: "abc123",
  temporaryPassword: "correct-horse-battery",
  expiresAt: "2026-08-19",
};

function stubClipboard(writeText: () => Promise<void>) {
  Object.defineProperty(navigator, "clipboard", {
    value: { writeText: vi.fn(writeText) },
    configurable: true,
  });
  return navigator.clipboard.writeText as ReturnType<typeof vi.fn>;
}

function stubShare(share: (data: ShareData) => Promise<void>) {
  Object.defineProperty(navigator, "share", {
    value: vi.fn(share),
    configurable: true,
  });
  return navigator.share as ReturnType<typeof vi.fn>;
}

afterEach(() => {
  Reflect.deleteProperty(navigator, "clipboard");
  Reflect.deleteProperty(navigator, "share");
  vi.restoreAllMocks();
});

describe("credential reveal", () => {
  beforeEach(() => {
    // execCommand is the non-secure-context fallback and jsdom has no such API.
    Object.defineProperty(document, "execCommand", {
      value: vi.fn(() => true),
      configurable: true,
    });
  });

  it("copies the PIN and the link together, not just the one on screen", async () => {
    const writeText = stubClipboard(async () => {});
    render(<CredentialRevealPanel reveal={reveal} onDismiss={() => {}} />);

    fireEvent.click(screen.getByRole("button", { name: "Copy" }));

    expect(writeText).toHaveBeenCalledWith(
      `PIN: ${reveal.pin}\nSign-in link: ${reveal.loginUrl}`,
    );
    expect(await screen.findByRole("status")).toHaveTextContent("Copied");
  });

  it("says so when the clipboard refuses rather than looking like it worked", async () => {
    stubClipboard(async () => {
      throw new Error("denied");
    });
    Object.defineProperty(document, "execCommand", {
      value: vi.fn(() => false),
      configurable: true,
    });
    render(<CredentialRevealPanel reveal={reveal} onDismiss={() => {}} />);

    fireEvent.click(screen.getByRole("button", { name: "Copy" }));

    await waitFor(() =>
      expect(screen.getByRole("status")).toHaveTextContent(
        "Could not copy. Select the text and copy it by hand.",
      ),
    );
  });

  it("hands the credentials to the device share sheet", async () => {
    const share = stubShare(async () => {});
    render(<CredentialRevealPanel reveal={reveal} onDismiss={() => {}} />);

    fireEvent.click(screen.getByRole("button", { name: "Share" }));

    expect(share).toHaveBeenCalledWith({
      title: "Your ZoomiGo sign-in",
      text: `PIN: ${reveal.pin}\nSign-in link: ${reveal.loginUrl}`,
    });
  });

  it("treats a dismissed share sheet as a decision, not a failure", async () => {
    stubShare(async () => {
      const abort = new Error("dismissed");
      abort.name = "AbortError";
      throw abort;
    });
    render(<CredentialRevealPanel reveal={reveal} onDismiss={() => {}} />);

    fireEvent.click(screen.getByRole("button", { name: "Share" }));

    // Nothing is said at all: an abort is the operator changing their mind.
    await waitFor(() =>
      expect(screen.getByRole("status").textContent).toBe(""),
    );
    expect(screen.queryByText(/could not share/i)).toBeNull();
  });

  it("shares the staff invitation with its password and expiry", async () => {
    const share = stubShare(async () => {});
    render(<InvitationPanel invitation={invitation} onDismiss={() => {}} />);

    fireEvent.click(screen.getByRole("button", { name: "Share" }));

    const text = share.mock.calls[0][0].text as string;
    expect(text).toContain(invitation.setupUrl);
    expect(text).toContain(invitation.temporaryPassword);
    expect(text).toContain(invitation.expiresAt);
  });

  it("still lets the operator acknowledge after copying", async () => {
    stubClipboard(async () => {});
    const onDismiss = vi.fn();
    render(<CredentialRevealPanel reveal={reveal} onDismiss={onDismiss} />);

    fireEvent.click(screen.getByRole("button", { name: "Copy" }));
    fireEvent.click(screen.getByRole("button", { name: "I have saved this" }));

    expect(onDismiss).toHaveBeenCalledOnce();
  });
});
