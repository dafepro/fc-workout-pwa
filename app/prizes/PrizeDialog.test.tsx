import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { useState } from "react";
import { describe, expect, it, vi } from "vitest";
import { PrizeDialog } from "./PrizeDialog";

function DialogHarness() {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" onClick={() => setOpen(true)}>
        How Prize Boxes work
      </button>
      {open ? (
        <PrizeDialog labelledBy="help-title" onClose={() => setOpen(false)}>
          <h2 id="help-title">How Prize Boxes work</h2>
          <button type="button">First action</button>
          <button type="button" onClick={() => setOpen(false)}>
            Close help
          </button>
        </PrizeDialog>
      ) : null}
    </>
  );
}

describe("PrizeDialog", () => {
  it("focuses its first control, closes with Escape, and restores focus", async () => {
    render(<DialogHarness />);
    const trigger = screen.getByRole("button", {
      name: "How Prize Boxes work",
    });
    trigger.focus();
    fireEvent.click(trigger);

    const dialog = screen.getByRole("dialog", {
      name: "How Prize Boxes work",
    });
    await waitFor(() =>
      expect(
        screen.getByRole("button", { name: "First action" }),
      ).toHaveFocus(),
    );
    fireEvent.keyDown(dialog, { key: "Escape" });

    await waitFor(() => expect(dialog).not.toBeInTheDocument());
    expect(trigger).toHaveFocus();
  });

  it("uses a modal native dialog so the browser owns the focus trap", () => {
    const onClose = vi.fn();
    render(
      <PrizeDialog labelledBy="dialog-title" onClose={onClose}>
        <h2 id="dialog-title">Prize detail</h2>
        <button type="button">Close</button>
      </PrizeDialog>,
    );

    const dialog = screen.getByRole("dialog", { name: "Prize detail" });
    expect(dialog.tagName).toBe("DIALOG");
    expect(dialog).toHaveAttribute("open");
  });

  it("removes its entrance motion under reduced-motion preferences", () => {
    const css = readFileSync(join(process.cwd(), "app", "globals.css"), "utf8");
    expect(css).toMatch(
      /@media \(prefers-reduced-motion: reduce\)[\s\S]*?\.prize-dialog\s*\{\s*animation: none;/,
    );
  });
});
