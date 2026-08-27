import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { TeamLounge } from "./TeamLounge";

vi.mock("./LocalLoungeCanvas", () => ({
  LocalLoungeCanvas: ({
    onStateChange,
  }: {
    onStateChange(state: string): void;
  }) => (
    <button type="button" onClick={() => onStateChange("ready")}>
      Interactive lounge canvas
    </button>
  ),
}));

describe("canonical Team Lounge", () => {
  it("mounts the canvas room without a version or alternate-view choice", () => {
    render(<TeamLounge playerID="player-one" />);

    expect(
      screen.getByRole("region", { name: "Beach Boardwalk Team Lounge" }),
    ).toBeVisible();
    expect(
      screen.getByRole("button", { name: "Interactive lounge canvas" }),
    ).toBeVisible();
    expect(screen.queryByRole("combobox")).toBeNull();
    expect(document.body.textContent).not.toMatch(
      /\bV[12]\b|preview|alternative/i,
    );

    fireEvent.click(
      screen.getByRole("button", { name: "Interactive lounge canvas" }),
    );
    expect(
      screen.getByText("Press your player, then drag to move."),
    ).toBeVisible();
  });
});
