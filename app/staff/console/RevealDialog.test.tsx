import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { RevealDialog } from "./RevealDialog";
import { CredentialRevealPanel } from "./RevealOnce";
import type { CredentialReveal } from "./types";

const reveal: CredentialReveal = {
  playerId: "p1",
  pin: "048213",
  loginUrl: "https://zoomigo.quicktrack.cc/login#credential=7f3a9c2b",
  qrPngBase64: "aGk=",
};

function renderDialog(onDismiss = vi.fn()) {
  render(
    <RevealDialog
      acknowledgement="I have saved the QR code, PIN, and link"
      onDismiss={onDismiss}
    >
      <CredentialRevealPanel reveal={reveal} />
    </RevealDialog>,
  );
  return onDismiss;
}

// REQ-509. The one-time credential is the only thing in the product that cannot
// be shown a second time, so closing it is a deliberate act, not a stray tap.
describe("one-time reveal dialog", () => {
  it("opens as a modal over whatever produced it", () => {
    renderDialog();
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    expect(screen.getByText(reveal.pin)).toBeVisible();
  });

  it("will not close until the acknowledgement is checked", () => {
    const onDismiss = renderDialog();
    const done = screen.getByRole("button", { name: "I have saved this" });

    expect(done).toBeDisabled();
    fireEvent.click(done);
    expect(onDismiss).not.toHaveBeenCalled();

    fireEvent.click(
      screen.getByRole("checkbox", {
        name: "I have saved the QR code, PIN, and link",
      }),
    );

    expect(done).toBeEnabled();
    fireEvent.click(done);
    expect(onDismiss).toHaveBeenCalledOnce();
  });

  it("survives Escape, which would otherwise discard the credential", () => {
    const onDismiss = renderDialog();
    const dialog = screen.getByRole("dialog");

    const cancel = new Event("cancel", { cancelable: true });
    dialog.dispatchEvent(cancel);

    expect(cancel.defaultPrevented).toBe(true);
    expect(onDismiss).not.toHaveBeenCalled();
    expect(screen.getByText(reveal.pin)).toBeVisible();
  });

  it("unchecking the acknowledgement locks the exit again", () => {
    const onDismiss = renderDialog();
    const checkbox = screen.getByRole("checkbox");

    fireEvent.click(checkbox);
    fireEvent.click(checkbox);

    expect(
      screen.getByRole("button", { name: "I have saved this" }),
    ).toBeDisabled();
    expect(onDismiss).not.toHaveBeenCalled();
  });
});
