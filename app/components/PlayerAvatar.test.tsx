import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { defaultAvatar } from "../avatar/config";
import { playerColor } from "../avatar/color";
import type { Player } from "../domain/types";
import { PlayerAvatar } from "./PlayerAvatar";

const avatarConfig = defaultAvatar();

vi.mock("../state/avatar-identity-context", () => ({
  useAvatarIdentity: () => ({
    currentPlayerID: "player-mason",
    avatarConfig,
  }),
}));

const mason: Player = player("player-mason", "Mason", "C.");
const ava: Player = player("player-ava", "Ava", "R.");

afterEach(cleanup);

describe("PlayerAvatar", () => {
  it("automatically uses and emphasizes the signed-in player's saved look", () => {
    const { container } = render(<PlayerAvatar player={mason} size="small" />);

    expect(container.querySelector(".avatar-art")).toBeInTheDocument();
    expect(container.querySelector(".avatar")).toHaveClass("avatar--self");
    expect(container.querySelector(".avatar")).toHaveAttribute(
      "aria-label",
      "Mason C., you",
    );
  });

  it("keeps teammates on their safe initials fallback", () => {
    const { container } = render(<PlayerAvatar player={ava} size="small" />);

    expect(container.querySelector(".avatar-art")).toBeNull();
    expect(container.querySelector(".avatar")).not.toHaveClass("avatar--self");
    expect(screen.getByText("AR")).toBeInTheDocument();
  });

  it("can suppress list emphasis without suppressing the saved look", () => {
    const { container } = render(
      <PlayerAvatar player={mason} emphasizeSelf={false} />,
    );

    expect(container.querySelector(".avatar-art")).toBeInTheDocument();
    expect(container.querySelector(".avatar")).not.toHaveClass("avatar--self");
    expect(container.querySelector(".avatar")).toHaveAttribute(
      "aria-label",
      "Mason C.",
    );
  });
});

function player(id: string, firstName: string, lastInitial: string): Player {
  return {
    id,
    firstName,
    lastInitial,
    initials: `${firstName[0]}${lastInitial[0]}`,
    avatarColor: playerColor(id),
    weeklySessions: 0,
    effortPoints: 0,
    currentStreak: 0,
    consistency: 0,
  };
}
