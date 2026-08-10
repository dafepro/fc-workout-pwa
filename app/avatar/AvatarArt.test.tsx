import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { Avatar } from "../components/Avatar";
import type { Player } from "../domain/types";
import { AVATAR_LAYERS } from "./catalog";
import { LAYER_ART } from "./art";
import { playerColor } from "./color";

const player: Player = {
  id: "player-mason",
  firstName: "Mason",
  lastInitial: "R.",
  initials: "MR",
  avatarColor: playerColor("player-mason"),
  weeklySessions: 0,
  effortPoints: 0,
  currentStreak: 0,
  consistency: 0,
};

describe("Avatar with a configuration", () => {
  it("draws vector art instead of initials", () => {
    const { container } = render(
      <Avatar player={player} config={{ head: "cheetah" }} />,
    );
    expect(container.querySelector("svg.avatar-art")).not.toBeNull();
    expect(screen.queryByText("MR")).toBeNull();
  });

  it("keeps the player's name as the accessible name", () => {
    const { container } = render(
      <Avatar player={player} config={{ head: "cheetah" }} />,
    );
    expect(container.querySelector(".avatar")).toHaveAttribute(
      "aria-label",
      "Mason R.",
    );
    expect(container.querySelector("svg")).toHaveAttribute(
      "aria-hidden",
      "true",
    );
  });

  it("never leaks an option id into the DOM", () => {
    const { container } = render(
      <Avatar
        player={player}
        config={{ head: "cheetah", eyewear: "aviators", background: "night" }}
      />,
    );
    const markup = container.innerHTML;
    for (const id of ["cheetah", "aviators", "night"]) {
      expect(markup).not.toContain(id);
    }
  });

  it("still renders art for an unknown stored option", () => {
    const { container } = render(
      <Avatar player={player} config={{ head: "dragon" }} />,
    );
    expect(container.querySelector("svg.avatar-art")).not.toBeNull();
    expect(container.querySelectorAll(".avatar-art__layer--head").length).toBe(
      1,
    );
  });

  it("falls back to initials with no configuration", () => {
    const { container } = render(<Avatar player={player} />);
    expect(container.querySelector("svg.avatar-art")).toBeNull();
    expect(screen.getByText("MR")).toBeInTheDocument();
  });
});

describe("the catalog and the art registry", () => {
  it("has art for every catalog option", () => {
    for (const layer of AVATAR_LAYERS) {
      for (const option of layer.options) {
        const art = LAYER_ART[layer.kind]({ ...option, color: "#000000" });
        // "none" is a real, deliberately empty option.
        if (option.id === "none") continue;
        expect(art, `${layer.kind}/${option.id}`).not.toBeNull();
      }
    }
  });

  it("gives every layer a default that exists in its options", () => {
    for (const layer of AVATAR_LAYERS) {
      expect(layer.options.map((option) => option.id)).toContain(
        layer.defaultOptionID,
      );
    }
  });
});
