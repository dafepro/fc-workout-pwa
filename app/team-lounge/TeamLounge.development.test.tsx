import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { TeamLounge } from "./TeamLounge";

vi.mock("../build-profile", () => ({ developmentBuild: true }));

vi.mock("./LocalLoungeCanvas", () => ({
  LocalLoungeCanvas: ({
    onStateChange,
  }: {
    onStateChange(state: string): void;
  }) => (
    <button type="button" onClick={() => onStateChange("ready")}>
      Finish loading
    </button>
  ),
}));

vi.mock("./SharedLoungeCanvas", () => ({ SharedLoungeCanvas: () => null }));

const player = {
  id: "player-one",
  firstName: "Mason",
  lastInitial: "C.",
  initials: "MC",
  avatarColor: "#6e56cf",
  weeklySessions: 0,
  effortPoints: 0,
  currentStreak: 0,
  consistency: 0,
};

describe("development Lounge loading preview", () => {
  it("reveals the Lounge as soon as the Canvas is ready", () => {
    render(<TeamLounge player={player} unlocked />);

    fireEvent.click(screen.getByRole("button", { name: "Finish loading" }));
    expect(screen.queryByRole("status")).toBeNull();
  });
});
